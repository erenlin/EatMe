--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    E2. RECIPE COOK                                                                                                 --
--  ================================================================================================================  --

--    Cooks a recipe: takes grams out of a list of item instances in one transaction.
--    p_lines is a jsonb array of { "instance_id": <int>, "grams": <int> }, one element per instance to draw from.
--
--    The function does not check the lines against the recipe's ingredients - the user may substitute freely.
--    It checks that: the recipe is the user's own or shared to them (active grant); every instance is the user's
--    own or belongs to an active grantor; no instance is expired or listed twice; every grams is > 0; and every
--    instance has at least that many grams left. Instances are locked (for update) before the check, so two
--    users cooking from the same instance at once cannot overdraw it.
--
--    Any failure raises and nothing is written. On success, inserts one item_consumption row per line
--    (reason 'consumed', user_id = p_user_id) and returns those rows with each instance's grams left afterwards.

create or replace function usp_recipe_cook (
    p_user_id       int,
    p_recipe_id     int,
    p_lines         jsonb
)
    returns table
            (
                consumption_id      integer,
                instance_id         integer,
                variant_id          integer,
                owner_user_id       integer,

                item_name           varchar,
                variant_name        varchar,

                grams_consumed      integer,
                remaining_grams     bigint,
                consumed_at         timestamptz
            )
    language plpgsql
    volatile
    set search_path = kitchen, public
as $$
declare
    -- Constants identifying the table and action.
    tabled_name     constant table_name := 'item_instances';
    action_name     constant log_action := 'update';

    -- Parsed lines, parallel arrays in input order.
    v_instance_ids  int[]       := '{}';
    v_grams         int[]       := '{}';
    v_remaining     bigint[]    := '{}';

    v_line          jsonb;
    v_index         int         := 0;
    v_instance_id   int;
    v_grams_line    numeric;
    v_check         record;
    v_row_count     int;

begin
    -- Step 01: Payload Validation
    if p_user_id is null then
        raise exception '% %: user id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'user_id';
    end if;

    if p_recipe_id is null then
        raise exception '% %: recipe id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'recipe_id';
    end if;

    if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
        raise exception '% %: lines must be a json array', action_name, tabled_name
            using errcode = 'invalid_parameter_value', detail = 'lines';
    end if;

    if jsonb_array_length(p_lines) = 0 then
        raise exception '% %: at least one line is required', action_name, tabled_name
            using errcode = 'check_violation', detail = 'lines';
    end if;

    -- Each element must be an object with an integer instance_id and a positive integer grams
    for v_line in select line_element from jsonb_array_elements(p_lines) as line_element
        loop
            v_index := v_index + 1;

            if jsonb_typeof(v_line) <> 'object'
                or jsonb_typeof(v_line -> 'instance_id') is distinct from 'number'
                or jsonb_typeof(v_line -> 'grams')       is distinct from 'number'
            then
                raise exception '% %: line % must be an object with numeric instance_id and grams',
                    action_name, tabled_name, v_index
                    using errcode = 'invalid_parameter_value', detail = 'lines';
            end if;

            v_grams_line := (v_line ->> 'grams')::numeric;

            if (v_line ->> 'instance_id')::numeric <> trunc((v_line ->> 'instance_id')::numeric)
                or v_grams_line <> trunc(v_grams_line)
            then
                raise exception '% %: line % instance_id and grams must be whole numbers',
                    action_name, tabled_name, v_index
                    using errcode = 'invalid_parameter_value', detail = 'lines';
            end if;

            if v_grams_line < 1 then
                raise exception '% %: line % grams must be 1 or greater, got %',
                    action_name, tabled_name, v_index, v_grams_line
                    using errcode = 'check_violation', detail = 'grams';
            end if;

            v_instance_id := (v_line ->> 'instance_id')::int;

            if v_instance_id = any (v_instance_ids) then
                raise exception '% %: instance #% is listed more than once',
                    action_name, tabled_name, v_instance_id
                    using errcode = 'unique_violation', detail = 'instance_id';
            end if;

            v_instance_ids := v_instance_ids || v_instance_id;
            v_grams        := v_grams        || v_grams_line::int;
        end loop;

    -- Step 02: User must exist
    if not exists (
        select
            1
        from
            users
        where
            users.id = p_user_id
    ) then
        raise exception '% %: user #% not found',
            action_name, tabled_name, p_user_id
            using errcode = 'no_data_found', detail = 'user_id';
    end if;

    -- Step 03: Recipe must exist and be the user's own or shared to them
    if not exists (
        select
            1
        from
            recipe
        where
            recipe.id = p_recipe_id
          and (
            recipe.user_id = p_user_id
                or recipe.user_id in (
                select
                    grant_row.grantor_user_id
                from
                    users_share grant_row
                where
                    grant_row.grantee_user_id = p_user_id
                  and grant_row.revoked_at is null
            )
            )
    ) then
        raise exception '% %: recipe #% not found',
            action_name, tabled_name, p_recipe_id
            using errcode = 'no_data_found', detail = 'recipe_id';
    end if;

    -- Step 04: Lock the instances, then check each one in input order
    -- The lock serialises concurrent cooks of the same instance, so the consumption sum below cannot go stale.
    perform
        1
    from
        item_instances
    where
        item_instances.id = any (v_instance_ids)
    order by
        item_instances.id          -- consistent lock order avoids deadlocks between two cooks
        for update;

    for v_check in
        select
            line.ordinality                                                 as c_index,
            line.c_instance_id,
            line.c_grams,
            instance.id                                                     as c_found_id,
            variant.user_id                                                 as c_owner_user_id,
            (
                variant.user_id = p_user_id
                    or variant.user_id in (
                    select
                        grant_row.grantor_user_id
                    from
                        users_share grant_row
                    where
                        grant_row.grantee_user_id = p_user_id
                      and grant_row.revoked_at is null
                )
                )                                                               as c_in_scope,
            (
                shelf.expiry_days is not null
                    and instance.added_at + make_interval(days => shelf.expiry_days::int + instance.expiry_modifier::int) <= now()
                )                                                               as c_expired,
            instance.quantity::bigint * instance.unit_weight_grams - used.u_grams
                as c_remaining
        from
            unnest(v_instance_ids, v_grams) with ordinality as line (c_instance_id, c_grams, ordinality)
                left join item_instances instance on instance.id = line.c_instance_id
                left join item_variants variant on variant.id = instance.variant_id
                left join expiry shelf on shelf.variant_id = instance.variant_id and shelf.store_mode = instance.store_mode

                cross join lateral (
                select  -- Total used so far, by anyone, for any reason; 0 when nothing is recorded yet
                        coalesce(sum(consumption.grams), 0)::bigint as u_grams
                from
                    item_consumption consumption
                where
                    consumption.instance_id = instance.id
                ) used
        order by
            line.ordinality
        loop
            if v_check.c_found_id is null or not v_check.c_in_scope then
                raise exception '% %: instance #% not found',
                    action_name, tabled_name, v_check.c_instance_id
                    using errcode = 'no_data_found', detail = 'instance_id';
            end if;

            if v_check.c_expired then
                raise exception '% %: instance #% has expired',
                    action_name, tabled_name, v_check.c_instance_id
                    using errcode = 'check_violation', detail = 'instance_id';
            end if;

            if v_check.c_remaining < v_check.c_grams then
                raise exception '% %: instance #% has % g left, % g requested',
                    action_name, tabled_name, v_check.c_instance_id, v_check.c_remaining, v_check.c_grams
                    using errcode = 'check_violation', detail = 'grams';
            end if;

            v_remaining := v_remaining || (v_check.c_remaining - v_check.c_grams);
        end loop;

    -- Step 05: Record the consumption and return the new rows with what is left on each instance
    return query
        with inserted as (
            insert into item_consumption (instance_id, user_id, grams, reason)
                select
                    line.i_instance_id,
                    p_user_id,
                    line.i_grams,
                    'consumed'
                from
                    unnest(v_instance_ids, v_grams) as line (i_instance_id, i_grams)
                returning
                    item_consumption.id,
                    item_consumption.instance_id,
                    item_consumption.grams,
                    item_consumption.consumed_at
        )
        select
            ins.id,
            ins.instance_id,
            variant.id,
            variant.user_id,

            item.item_name,
            variant.variant_name,

            ins.grams,
            line.l_remaining,
            ins.consumed_at
        from
            inserted ins
                inner join unnest(v_instance_ids, v_remaining) as line (l_instance_id, l_remaining)
                           on line.l_instance_id = ins.instance_id
                inner join item_instances instance on instance.id = ins.instance_id
                inner join item_variants variant on variant.id = instance.variant_id
                inner join items item on item.id = variant.item_id
        order by
            ins.id;

    get diagnostics v_row_count = row_count;

    -- Step 06: Log successful operation
    perform usp_log_operation (
            p_user_id       := p_user_id,
            p_action        := action_name,
            p_table_name    := tabled_name,
            p_row_id        := null,
            p_details       := jsonb_build_object (
                    'recipe_id',     p_recipe_id,
                    'instance_ids',  to_jsonb(v_instance_ids),
                    'grams',         to_jsonb(v_grams),
                    'line_count',    v_row_count
                               )
            );
end;
$$;

--  ================================================= END OF FILE ==================================================  --
--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    C1a. INSTANCE GET                                                                                               --
--  ================================================================================================================  --

--    Lists the active instances of one of the user's variants.
--    Used-up instances (their item_consumption rows add up to the total weight) are left out.
--    With p_include_shared, it also lists the instances of matching variants from every user who shares with the acting user.
--    Grantors' variants have their own ids, so they are matched by name:
--      score = 0.5 x item-name similarity + 0.5 x variant-name similarity (pg_trgm, case-insensitive), kept when score >= p_min_score.
--    The user's own variant always scores 1.

create or replace function usp_instance_get (
    p_user_id           int,
    p_variant_id        int,
    p_include_shared    boolean     default false,
    p_min_score         real        default 0.75
)
    returns table
(
    instance_id         integer,
    user_id             integer,
    variant_id          integer,

    item_name           varchar,
    variant_name        varchar,
    match_score         real,
    store_mode          store,

    quantity            integer,
    unit_weight_grams   integer,
    total_grams         integer,
    grams_consumed      integer,
    grams_remaining     integer,

    expiry_modifier     smallint,
    added_at            timestamptz,
    expires_at          timestamptz
)
    language plpgsql
    volatile
    set search_path = kitchen, public
as $$
declare
    -- Constants identifying the table and action.
    tabled_name         constant table_name := 'item_instances';
    action_name         constant log_action := 'select';

    v_include_shared    boolean := coalesce(p_include_shared, false);
    v_min_score         real    := coalesce(p_min_score, 0.75);

    v_item_name         varchar;
    v_variant_name      varchar;
    v_row_count         int;

begin
    -- Step 01: Payload Validation
    if p_user_id is null then
        raise exception '% %: user id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'user_id';
    end if;

    if p_variant_id is null then
        raise exception '% %: variant id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'variant_id';
    end if;

    if v_min_score not between 0 and 1 then
        raise exception '% %: minimum score must be between 0 and 1, got %',
            action_name, tabled_name, v_min_score
            using errcode = 'check_violation', detail = 'min_score';
    end if;

    -- Step 02: Ownership check; also fetch the names used to match grantors' variants
    select
        items.item_name,
        variant.variant_name
    into
        v_item_name,
        v_variant_name
    from
        item_variants variant join items
                                   on items.id = variant.item_id
    where
        variant.id = p_variant_id and variant.user_id = p_user_id;

    if not found then
        raise exception '% %: variant #% not found for user #%',
            action_name, tabled_name, p_variant_id, p_user_id
            using errcode = 'no_data_found', detail = 'variant_id';
    end if;

    -- Step 03: Matching variants (own + grantors'), then their active instances, soonest expiry first
    return query
        with candidates as (
            select  -- The user's own variant
                own.id          as c_variant_id,
                own.user_id     as c_user_id,
                v_item_name     as c_item_name,
                v_variant_name  as c_variant_name,
                1.0::real       as c_score
            from
                item_variants own
            where
                own.id = p_variant_id

            union all

            select  -- Variants of every user with an active grant to the acting user
                scored.s_variant_id,
                scored.s_user_id,
                scored.s_item_name,
                scored.s_variant_name,
                scored.s_score
            from (
                select
                    shared_variant.id            as s_variant_id,
                    shared_variant.user_id       as s_user_id,
                    shared_item.item_name        as s_item_name,
                    shared_variant.variant_name  as s_variant_name,
                    (0.5 * similarity(lower(shared_item.item_name), lower(v_item_name)) + 0.5 * similarity(lower(shared_variant.variant_name), lower(v_variant_name)))::real
                    as s_score
                from
                    users_share grant_row
                        join item_variants shared_variant on shared_variant.user_id = grant_row.grantor_user_id
                        join items shared_item on shared_item.id = shared_variant.item_id
                where
                    v_include_shared and grant_row.grantee_user_id = p_user_id and grant_row.revoked_at is null) scored
            where
                scored.s_score >= v_min_score
        ),

             results as (
                 select
                     instance.id                                     as r_instance_id,
                     candidate.c_user_id                             as r_user_id,
                     candidate.c_variant_id                          as r_variant_id,

                     candidate.c_item_name                           as r_item_name,
                     candidate.c_variant_name                        as r_variant_name,
                     candidate.c_score                               as r_score,
                     instance.store_mode                             as r_store_mode,

                     instance.quantity                               as r_quantity,
                     instance.unit_weight_grams                      as r_unit_weight,
                     instance.quantity * instance.unit_weight_grams  as r_total_grams,
                     used.u_grams                                    as r_grams_consumed,
                     instance.quantity * instance.unit_weight_grams
                         - used.u_grams                              as r_grams_remaining,

                     instance.expiry_modifier                        as r_expiry_modifier,
                     instance.added_at                               as r_added_at,
                     instance.added_at
                         + make_interval(days => shelf.expiry_days::int + instance.expiry_modifier::int)
                                                                     as r_expires_at
                 from
                     candidates candidate
                         join item_instances instance on instance.variant_id = candidate.c_variant_id
                         left join expiry shelf on shelf.variant_id = instance.variant_id and shelf.store_mode = instance.store_mode

                         cross join lateral (
                             select  -- Total used so far, by anyone, for any reason; 0 when nothing is recorded yet
                                 coalesce(sum(consumption.grams), 0)::int  as u_grams
                             from
                                 item_consumption consumption
                             where
                                 consumption.instance_id = instance.id
                         ) used
                 where
                     used.u_grams < instance.quantity * instance.unit_weight_grams
             )
        select
            res.r_instance_id,
            res.r_user_id,
            res.r_variant_id,

            res.r_item_name,
            res.r_variant_name,
            res.r_score,
            res.r_store_mode,

            res.r_quantity,
            res.r_unit_weight,
            res.r_total_grams,
            res.r_grams_consumed,
            res.r_grams_remaining,

            res.r_expiry_modifier,
            res.r_added_at,
            res.r_expires_at
        from
            results res
        order by
            res.r_expires_at nulls last,
            res.r_added_at,
            res.r_instance_id;

    get diagnostics v_row_count = row_count;

    -- Step 04: Log successful operation
    perform usp_log_operation (
        p_user_id       := p_user_id,
        p_action        := action_name,
        p_table_name    := tabled_name,
        p_row_id        := p_variant_id,
        p_details       := jsonb_build_object (
            'include_shared',  v_include_shared,
            'min_score',       v_min_score,
            'instance_count',  v_row_count
       )
    );
end;
$$;

--  ================================================= END OF FILE ==================================================  --

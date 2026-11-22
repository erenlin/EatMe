--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    F1. RECIPE RESTOCK                                                                                             --
--  ================================================================================================================  --

--    The "restock" button. Registers every ingredient line of the recipe, scaled by p_multiplier, as open demand
--    on the user's own variants. Pressing it again for the same recipe replaces that recipe's open rows, so a
--    changed multiplier does not stack. The shopping list (usp_restock_get) subtracts stock at read time.
--
--    A shared recipe references its owner's variants; each line is mapped to the user's own variant by exact,
--    case-insensitive item name and variant name. Lines with no such variant are returned with status
--    'no_variant' and nothing is added for them.
--
--    Returns one row per ingredient line: status 'added' or 'no_variant', with grams needed and own grams on hand.

create or replace function usp_recipe_restock (
    p_user_id       int,
    p_recipe_id     int,
    p_multiplier    int     default 1
)
    returns table
            (
                restock_id          integer,
                variant_id          integer,
                item_name           varchar,
                variant_name        varchar,
                grams_needed        bigint,
                grams_on_hand       bigint,
                status              varchar
            )
    language plpgsql
    volatile
    set search_path = kitchen, public
as $$
declare
    -- Constants identifying the table and action.
    tabled_name     constant table_name := 'restock';
    action_name     constant log_action := 'insert';

    v_multiplier    int := coalesce(p_multiplier, 1);
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

    if v_multiplier < 1 then
        raise exception '% %: multiplier must be 1 or greater, got %',
            action_name, tabled_name, v_multiplier
            using errcode = 'check_violation', detail = 'multiplier';
    end if;

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

    -- Step 04: Replace - resolve this recipe's open rows before re-registering its demand
    update
        restock
    set
        resolved_at = now()
    where
        restock.user_id = p_user_id
      and restock.recipe_id = p_recipe_id
      and restock.resolved_at is null;

    -- Step 05: Map each line to an own variant, insert demand, return every line with its outcome
    return query
        with lines as (
            select  -- Each ingredient line, mapped to the user's own variant (same id for own recipes, by name for shared)
                    ingredient.id                               as l_ingredient_id,
                    ingredient.position                         as l_position,
                    line_item.item_name                         as l_item_name,
                    line_variant.variant_name                   as l_variant_name,
                    ingredient.grams::bigint * v_multiplier     as l_grams,
                    own_variant.id                              as l_own_variant_id
            from
                recipe_ingredients ingredient
                    inner join item_variants line_variant on line_variant.id = ingredient.variant_id
                    inner join items line_item on line_item.id = line_variant.item_id

                    left join item_variants own_variant
                    inner join items own_item on own_item.id = own_variant.item_id
                               on own_variant.user_id = p_user_id
                                   and (
                                      own_variant.id = line_variant.id
                                          or (
                                          lower(own_item.item_name)       = lower(line_item.item_name)
                                              and lower(own_variant.variant_name) = lower(line_variant.variant_name)
                                          )
                                      )
            where
                ingredient.recipe_id = p_recipe_id
        ),

             stock as materialized (
                 select  -- Own grams on hand per variant: active, unexpired instances only
                         stock_variant.id    as k_variant_id,
                         sum(instance.quantity::bigint * instance.unit_weight_grams - used.u_grams)
                                             as k_grams
                 from
                     lines
                         inner join item_variants stock_variant on stock_variant.id = lines.l_own_variant_id
                         inner join item_instances instance on instance.variant_id = stock_variant.id
                         left join expiry shelf on shelf.variant_id = instance.variant_id and shelf.store_mode = instance.store_mode

                         cross join lateral (
                         select
                             coalesce(sum(consumption.grams), 0)::bigint as u_grams
                         from
                             item_consumption consumption
                         where
                             consumption.instance_id = instance.id
                         ) used
                 where
                     used.u_grams < instance.quantity::bigint * instance.unit_weight_grams
                   and (
                     shelf.expiry_days is null
                         or instance.added_at + make_interval(days => shelf.expiry_days::int + instance.expiry_modifier::int) > now()
                     )
                 group by
                     stock_variant.id
             ),

             inserted as (
                 insert into restock (user_id, variant_id, recipe_id, multiplier, grams_needed)
                     select
                         p_user_id,
                         lines.l_own_variant_id,
                         p_recipe_id,
                         v_multiplier,
                         lines.l_grams
                     from
                         lines
                     where
                         lines.l_own_variant_id is not null
                     returning
                         restock.id,
                         restock.variant_id
             )

        select
            ins.id,
            lines.l_own_variant_id,
            lines.l_item_name,
            lines.l_variant_name,
            lines.l_grams,
            coalesce(stock.k_grams, 0)::bigint,
            case
                when lines.l_own_variant_id is null then 'no_variant'
                else
                    'added'
                end::varchar
        from
            lines
                left join inserted ins on ins.variant_id = lines.l_own_variant_id
                left join stock on stock.k_variant_id = lines.l_own_variant_id
        order by
            lines.l_position,
            lines.l_ingredient_id;

    get diagnostics v_row_count = row_count;

    -- Step 06: Log successful operation
    perform usp_log_operation (
            p_user_id       := p_user_id,
            p_action        := action_name,
            p_table_name    := tabled_name,
            p_row_id        := null,
            p_details       := jsonb_build_object (
                    'recipe_id',   p_recipe_id,
                    'multiplier',  v_multiplier,
                    'line_count',  v_row_count
                               )
            );
end;
$$;

--  ================================================= END OF FILE ==================================================  --

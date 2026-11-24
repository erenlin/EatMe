--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    F2. RESTOCK GET                                                                                                 --
--  ================================================================================================================  --

--    The shopping list. One row per own variant with open demand: total grams wanted across open rows, own grams
--    on hand (active, unexpired), grams to buy, and whole units to buy (grams to buy / typical unit weight,
--    rounded up). Variants whose stock already covers their demand are left out unless p_include_covered.
--    Sorted by item name, then variant name, case-insensitive.

create or replace function usp_restock_get (
    p_user_id           int,
    p_include_covered   boolean default false
)
    returns table
            (
                variant_id              integer,
                item_name               varchar,
                variant_name            varchar,
                typical_weight_grams    integer,
                counting_method         counting,
                icon_png                bytea,

                grams_needed            bigint,
                grams_on_hand           bigint,
                grams_to_buy            bigint,
                units_to_buy            integer,

                recipes                 jsonb,
                oldest_created_at       timestamptz
            )
    language plpgsql
    stable
    set search_path = kitchen, public
as $$
begin
    return query
        with demand as (
            select  -- Open demand per variant, with the recipes that want it
                    open_row.variant_id                 as d_variant_id,
                    sum(open_row.grams_needed)::bigint  as d_grams,
                    min(open_row.created_at)            as d_oldest,
                    jsonb_agg (
                            jsonb_build_object (
                                    'recipe_id',    open_row.recipe_id,
                                    'recipe_name',  header.recipe_name,
                                    'multiplier',   open_row.multiplier,
                                    'grams',        open_row.grams_needed
                            )
                            order by
                                lower(header.recipe_name) nulls last,
                                open_row.id
                    )                                   as d_recipes
            from
                restock open_row
                    left join recipe header on header.id = open_row.recipe_id
            where
                open_row.user_id = p_user_id
              and open_row.resolved_at is null
            group by
                open_row.variant_id
        ),

             stock as (
                 select  -- Own grams on hand per variant: active, unexpired instances only
                         instance.variant_id as k_variant_id,
                         sum(instance.quantity::bigint * instance.unit_weight_grams - used.u_grams)
                                             as k_grams
                 from
                     demand
                         inner join item_instances instance on instance.variant_id = demand.d_variant_id
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
                     instance.variant_id
             ),

             computed as (
                 select
                     variant.id                                                  as c_variant_id,
                     item.item_name                                              as c_item_name,
                     variant.variant_name                                        as c_variant_name,
                     variant.typical_weight_grams                                as c_typical_weight_grams,
                     variant.counting_method                                     as c_counting_method,
                     variant.icon_png                                            as c_icon_png,

                     demand.d_grams                                              as c_grams_needed,
                     coalesce(stock.k_grams, 0)::bigint                          as c_grams_on_hand,
                     greatest(demand.d_grams - coalesce(stock.k_grams, 0), 0)::bigint
                                                                                 as c_grams_to_buy,

                     demand.d_recipes                                            as c_recipes,
                     demand.d_oldest                                             as c_oldest
                 from
                     demand
                         inner join item_variants variant on variant.id = demand.d_variant_id
                         inner join items item on item.id = variant.item_id
                         left join stock on stock.k_variant_id = demand.d_variant_id
             )

        select
            comp.c_variant_id,
            comp.c_item_name,
            comp.c_variant_name,
            comp.c_typical_weight_grams,
            comp.c_counting_method,
            comp.c_icon_png,

            comp.c_grams_needed,
            comp.c_grams_on_hand,
            comp.c_grams_to_buy,
            ceil(comp.c_grams_to_buy::numeric / comp.c_typical_weight_grams)::int,

            comp.c_recipes,
            comp.c_oldest
        from
            computed comp
        where
            coalesce(p_include_covered, false)
           or comp.c_grams_to_buy > 0
        order by
            lower(comp.c_item_name),
            lower(comp.c_variant_name),
            comp.c_variant_id;
end
$$;


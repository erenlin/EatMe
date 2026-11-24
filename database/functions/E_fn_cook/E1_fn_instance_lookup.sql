--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    E1. INSTANCE LOOKUP                                                                                             --
--  ================================================================================================================  --

--    Fuzzy search over the user's item instances by "item variant" name, optionally including instances shared
--    with the user (active grants only). Returns one row per instance with the grams still on it, so the frontend
--    can pick instances and amounts to pass to usp_recipe_cook.
--
--    Used-up instances are always left out. Expired instances are left out unless p_include_expired; instances
--    with no expiry set for their store mode never expire. p_variant_id narrows the search to one variant.
--    Empty query returns everything in scope. Prefix matches rank first, then trigram similarity, then own
--    instances before shared ones, then soonest expiry, then oldest purchase.

create or replace function usp_instance_lookup (
    p_user_id           int,
    p_query             varchar default '',
    p_shared            boolean default false,
    p_variant_id        int     default null,
    p_include_expired   boolean default false
)
    returns table
            (
                instance_id         integer,
                variant_id          integer,

                owner_user_id       integer,
                owner_name          varchar,
                is_own              boolean,

                item_name           varchar,
                variant_name        varchar,
                store_mode          store,

                quantity            integer,
                unit_weight_grams   integer,
                total_grams         bigint,
                used_grams          bigint,
                remaining_grams     bigint,

                added_at            timestamptz,
                expires_at          timestamptz,
                is_expired          boolean
            )
    language plpgsql
    stable
    set search_path = kitchen, public
as $$
begin
    return query
        with
            search as (
                select coalesce(trim(p_query), '') as term
            ),

            scope as (
                select  -- The acting user's inventory
                        p_user_id as s_user_id

                union all

                select  -- Inventory of every user with an active grant to the acting user
                        grant_row.grantor_user_id
                from
                    users_share grant_row
                where
                    coalesce(p_shared, false)
                  and grant_row.grantee_user_id = p_user_id
                  and grant_row.revoked_at is null
            ),

            candidates as (
                select
                    instance.id                                                     as c_instance_id,
                    variant.id                                                      as c_variant_id,
                    variant.user_id                                                 as c_owner_user_id,
                    (owner_row.first_name || ' ' || owner_row.last_name)::varchar   as c_owner_name,
                    (variant.user_id = p_user_id)                                   as c_is_own,

                    item.item_name                                                  as c_item_name,
                    variant.variant_name                                            as c_variant_name,
                    (item.item_name || ' ' || variant.variant_name)                 as c_full_name,
                    instance.store_mode                                             as c_store_mode,

                    instance.quantity                                               as c_quantity,
                    instance.unit_weight_grams                                      as c_unit_weight_grams,
                    instance.quantity::bigint * instance.unit_weight_grams          as c_total_grams,
                    used.u_grams                                                    as c_used_grams,

                    instance.added_at                                               as c_added_at,
                    case
                        when shelf.expiry_days is null then null
                        else
                            instance.added_at + make_interval(days => shelf.expiry_days::int + instance.expiry_modifier::int)
                        end                                                             as c_expires_at
                from
                    scope
                        inner join item_variants variant on variant.user_id = scope.s_user_id
                        inner join items item on item.id = variant.item_id
                        inner join users owner_row on owner_row.id = variant.user_id
                        inner join item_instances instance on instance.variant_id = variant.id
                        left join expiry shelf on shelf.variant_id = instance.variant_id and shelf.store_mode = instance.store_mode

                        cross join lateral (
                        select  -- Total used so far, by anyone, for any reason; 0 when nothing is recorded yet
                                coalesce(sum(consumption.grams), 0)::bigint as u_grams
                        from
                            item_consumption consumption
                        where
                            consumption.instance_id = instance.id
                        ) used
                where
                    (p_variant_id is null or variant.id = p_variant_id)
                  and used.u_grams < instance.quantity::bigint * instance.unit_weight_grams
            )

        select
            cand.c_instance_id,
            cand.c_variant_id,

            cand.c_owner_user_id,
            cand.c_owner_name,
            cand.c_is_own,

            cand.c_item_name,
            cand.c_variant_name,
            cand.c_store_mode,

            cand.c_quantity,
            cand.c_unit_weight_grams,
            cand.c_total_grams,
            cand.c_used_grams,
            cand.c_total_grams - cand.c_used_grams,

            cand.c_added_at,
            cand.c_expires_at,
            (cand.c_expires_at is not null and cand.c_expires_at <= now())
        from
            candidates cand, search
        where
            (
                coalesce(p_include_expired, false)
                    or cand.c_expires_at is null
                    or cand.c_expires_at > now()
                )
          and (
            search.term = ''
                or cand.c_full_name ilike '%' || search.term || '%'
                or cand.c_full_name % search.term
            )
        order by
            (cand.c_full_name ilike search.term || '%') desc,
            similarity(cand.c_full_name, search.term) desc,
            cand.c_is_own desc,                         -- own copy before a shared one
            cand.c_expires_at asc nulls last,           -- use what expires soonest first
            cand.c_added_at asc,                        -- then oldest purchase
            cand.c_instance_id
        limit 100;
end
$$;

--  ================================================= END OF FILE ==================================================  --
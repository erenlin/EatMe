--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    B1b. VARIANT LOOKUP                                                                                             --
--  ================================================================================================================  --

--    Fuzzy search over one item's variants, optionally including variants shared with the user.
--    Empty query returns all of them (alphabetical). Prefix matches rank first, then trigram similarity.

create or replace function usp_variant_lookup (
    p_user_id   int,
    p_item_id   int,
    p_query     varchar default '',
    p_shared    boolean default false
)
    returns table
(
    variant_id              integer,
    variant_name            varchar,

    typical_weight_grams    integer,
    serving_grams           integer,
    counting_method         counting,
    default_store_mode      store,

    icon_png                bytea,
    created_at              timestamptz,

    owner_user_id           integer
)
    language plpgsql
    stable
    set search_path = kitchen, public
as $$
begin
    return query
        with
            search as (select coalesce(trim(p_query), '') as term)
        select
            item_variants.id,
            item_variants.variant_name,

            item_variants.typical_weight_grams,
            item_variants.serving_grams,
            item_variants.counting_method,
            item_variants.default_store_mode,

            item_variants.icon_png,
            item_variants.created_at,

            item_variants.user_id
        from
            item_variants, search
        where
            (
                item_variants.user_id = p_user_id
                    or (
                    coalesce(p_shared, false)
                        and item_variants.user_id in (
                        select users_share.grantor_user_id
                        from users_share
                        where users_share.grantee_user_id = p_user_id
                          and users_share.revoked_at is null  -- active grants only
                    )
                    )
                )
          and item_variants.item_id = p_item_id
          and (
            search.term = ''
                or item_variants.variant_name ilike '%' || search.term || '%'
                or item_variants.variant_name % search.term
            )
        order by
            (item_variants.variant_name ilike search.term || '%') desc,
            similarity(item_variants.variant_name, search.term) desc,
            item_variants.variant_name,
            (item_variants.user_id = p_user_id) desc               -- own copy before a shared one of the same name
        limit 100;
end
$$;

--  ================================================= END OF FILE ==================================================  --
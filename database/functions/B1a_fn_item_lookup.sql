--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    B1a. ITEM LOOKUP                                                                                                --
--  ================================================================================================================  --

--    Fuzzy search over the user's items. Empty query returns everything (alphabetical).
--    Prefix matches rank first, then trigram similarity.

create or replace function usp_item_lookup (
    p_user_id   int,
    p_query     varchar default ''
)
    returns table
(
    item_id     integer,
    item_name   varchar
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
            items.id, items.item_name
        from
            items, search
        where
            items.user_id = p_user_id
          and (
            search.term = ''
                or items.item_name ilike '%' || search.term || '%'
                or items.item_name % search.term  -- pg_trgm: catches typos ("tomatoe")
            )
        order by
            (items.item_name ilike search.term || '%') desc,  -- prefix matches first
            similarity(items.item_name, search.term) desc,
            items.item_name
        limit 100;
end
$$;

--  ================================================= END OF FILE ==================================================  --

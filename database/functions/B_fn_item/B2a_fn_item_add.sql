--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    B2a. ITEM ADD                                                                                                   --
--  ================================================================================================================  --

--    Creates an item for the user. Names are trimmed and must be unique per user (case-insensitive,
--    enforced by uq_items_user_name_ci). Returns the new item id, which usp_variant_add needs.

create or replace function usp_item_add (
    p_user_id       int,
    p_item_name     varchar
)
    returns table
(
    item_id         integer,
    item_name       varchar,
    created_at      timestamptz
)
    language plpgsql
    volatile
    set search_path = kitchen, public
as $$
declare
    -- Constants identifying the table and action.
    tabled_name             constant table_name := 'items';
    action_name             constant log_action := 'insert';

    v_name                  varchar := trim(p_item_name);
    v_existing_item_id      int;

    v_out_item_id           int;
    v_out_item_name         varchar;
    v_out_created_at        timestamptz;

begin
    -- Step 01: Payload Validation
    if p_user_id is null then
        raise exception '% %: user id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'user_id';
    end if;

    if v_name is null or v_name = '' then
        raise exception '% %: item name is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'item_name';
    end if;

    -- Step 02: Insert new item record; the unique index rejects duplicates (any case)
    begin
        insert into
            items (user_id, item_name)
        values
            (p_user_id, v_name)
        returning
            items.id,
            items.item_name,
            items.created_at
            into
                v_out_item_id,
                v_out_item_name,
                v_out_created_at;
    exception
        when unique_violation then
            select
                items.id
            into
                v_existing_item_id
            from
                items
            where
                items.user_id = p_user_id
              and lower(items.item_name) = lower(v_name);

            raise exception '% %: item "%" already exists (item #%)',
                action_name, tabled_name, v_name, v_existing_item_id
                using errcode = 'unique_violation', detail = 'item_name';
    end;

    -- Step 03: Log successful operation
    perform usp_log_operation (
        p_user_id       := p_user_id,
        p_action        := action_name,
        p_table_name    := tabled_name,
        p_row_id        := v_out_item_id,
        p_details       := jsonb_build_object('item_name', v_out_item_name)
    );

    -- Step 04: Return the result
    return query select v_out_item_id     as item_id,
                        v_out_item_name   as item_name,
                        v_out_created_at  as created_at;
end;
$$;

--  ================================================= END OF FILE ==================================================  --
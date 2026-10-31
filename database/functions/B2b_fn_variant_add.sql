--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    B2b. VARIANT ADD                                                                                                --
--  ================================================================================================================  --

--    Creates a variant under one of the user's items (from usp_item_add or usp_item_lookup).
--    Names are trimmed and must be unique per item (case-insensitive).

create or replace function usp_variant_add (
    p_user_id               int,
    p_item_id               int,
    p_variant_name          varchar,
    p_typical_weight_grams  int,
    p_serving_grams         int,
    p_counting_method       counting    default 'divisible',
    p_default_store_mode    store       default 'room',
    p_icon_png              bytea       default null
)
    returns table
(
    variant_id              integer,
    item_id                 integer,
    variant_name            varchar,
    typical_weight_grams    integer,
    serving_grams           integer,
    counting_method         counting,
    default_store_mode      store,
    created_at              timestamptz
)
    language plpgsql
    volatile
    set search_path = kitchen, public
as $$
declare
    -- Constants identifying the table and action.
    tabled_name             constant table_name := 'item_variants';
    action_name             constant log_action := 'insert';

    v_name                  varchar  := trim(p_variant_name);
    v_counting              counting := coalesce(p_counting_method, 'divisible');
    v_store                 store    := coalesce(p_default_store_mode, 'room');
    v_existing_variant_id   int;

    v_out_variant_id        int;
    v_out_item_id           int;
    v_out_variant_name      varchar;
    v_out_typical_weight    int;
    v_out_serving_grams     int;
    v_out_counting          counting;
    v_out_store             store;
    v_out_created_at        timestamptz;

begin
    -- Step 01: Payload Validation

    if p_user_id is null then
        raise exception '% %: user id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'user_id';
    end if;

    if p_item_id is null then
        raise exception '% %: item id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'item_id';
    end if;

    if v_name is null or v_name = '' then
        raise exception '% %: variant name is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'variant_name';
    end if;

    --

    if p_typical_weight_grams is null or p_typical_weight_grams <= 0 then
        raise exception '% %: typical weight must be greater than 0 g', action_name, tabled_name
            using errcode = 'check_violation', detail = 'typical_weight_grams';
    end if;

    if p_serving_grams is null or p_serving_grams <= 0 then
        raise exception '% %: serving weight must be greater than 0 g', action_name, tabled_name
            using errcode = 'check_violation', detail = 'serving_grams';
    end if;

    --

    if v_counting = 'divisible' and p_serving_grams > p_typical_weight_grams then
        raise exception '% %: a divisible serving (% g) cannot exceed the unit weight (% g)',
            action_name, tabled_name, p_serving_grams, p_typical_weight_grams
            using errcode = 'check_violation', detail = 'serving_grams';
    end if;

    if v_counting = 'numerable' and p_serving_grams < p_typical_weight_grams then
        raise exception '% %: a numerable serving (% g) must be at least one unit (% g)',
            action_name, tabled_name, p_serving_grams, p_typical_weight_grams
            using errcode = 'check_violation', detail = 'serving_grams';
    end if;

    --

    if p_icon_png is not null and octet_length(p_icon_png) > 100000 then
        raise exception '% %: icon must be 100 KB or smaller', action_name, tabled_name
            using errcode = 'check_violation', detail = 'icon_png';
    end if;

    if p_icon_png is not null and substring(p_icon_png from 1 for 8) <> '\x89504e470d0a1a0a'::bytea then
        raise exception '% %: icon must be a PNG file', action_name, tabled_name
            using errcode = 'check_violation', detail = 'icon_png';
    end if;

    -- Step 02: Check the item exists and belongs to the user
    if not exists (select 1
                   from
                       items
                   where
                       items.id = p_item_id
                     and
                       items.user_id = p_user_id) then
                           raise exception '% %: item not found', action_name, tabled_name
                               using errcode = 'no_data_found', detail = 'item_id';
    end if;

    -- Step 03: Insert new variant record; the unique index rejects duplicates (any case)
    begin
        insert into item_variants (item_id, user_id, variant_name,
                                   typical_weight_grams, serving_grams,
                                   counting_method, default_store_mode, icon_png)
        values (p_item_id, p_user_id, v_name,
                p_typical_weight_grams, p_serving_grams,
                v_counting, v_store, p_icon_png)
        returning
            item_variants.id,
            item_variants.item_id,
            item_variants.variant_name,
            item_variants.typical_weight_grams,
            item_variants.serving_grams,
            item_variants.counting_method,
            item_variants.default_store_mode,
            item_variants.created_at
        into
            v_out_variant_id,
            v_out_item_id,
            v_out_variant_name,
            v_out_typical_weight,
            v_out_serving_grams,
            v_out_counting,
            v_out_store,
            v_out_created_at;
    exception
        when unique_violation then
            select
                iv.id
            into
                v_existing_variant_id
            from
                item_variants iv
            where
                iv.item_id = p_item_id
              and lower(iv.variant_name) = lower(v_name);

            raise exception '% %: variant "%" already exists for this item (variant #%)',
                action_name, tabled_name, v_name, v_existing_variant_id
                using errcode = 'unique_violation', detail = 'variant_name';

        when foreign_key_violation then
            -- item was deleted after the Step 02 check
            raise exception '% %: item not found', action_name, tabled_name
                using errcode = 'no_data_found', detail = 'item_id';
    end;

    -- Step 04: Log successful operation (icon left out of the details)
    perform usp_log_operation (
        p_user_id       := p_user_id,
        p_action        := action_name,
        p_table_name    := tabled_name,
        p_row_id        := v_out_variant_id,
        p_details       := jsonb_build_object('item_id',      v_out_item_id,
                                              'variant_name', v_out_variant_name)
    );

    -- Step 05: Return the result
    return query select v_out_variant_id      as variant_id,
                        v_out_item_id         as item_id,
                        v_out_variant_name    as variant_name,
                        v_out_typical_weight  as typical_weight_grams,
                        v_out_serving_grams   as serving_grams,
                        v_out_counting        as counting_method,
                        v_out_store           as default_store_mode,
                        v_out_created_at      as created_at;
end;
$$;

--  ================================================= END OF FILE ==================================================  --

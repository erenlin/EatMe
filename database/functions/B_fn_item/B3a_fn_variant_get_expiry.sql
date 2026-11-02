--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    B3a. ITEM GET EXPIRY                                                                                            --
--  ================================================================================================================  --

--    Fetches the shelf life of a variant for every storage mode that has one. The variant must belong to
--    the user. Rows cleared to null by usp_variant_del_expiry are treated as deleted and left out.

create or replace function usp_variant_get_expiry (
    p_user_id       int,
    p_variant_id    int
)
    returns table
(
    variant_id      integer,
    store_mode      store,
    expiry_days     smallint
)
    language plpgsql
    volatile
    set search_path = kitchen, public
as $$
declare
    -- Constants identifying the table and action.
    tabled_name     constant table_name := 'expiry';
    action_name     constant log_action := 'select';

    v_row_count     int;

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

    -- Step 02: Ownership check; the variant must exist and belong to the user
    if not exists (
        select
            1
        from
            item_variants
        where
            item_variants.id = p_variant_id
          and item_variants.user_id = p_user_id
    ) then
        raise exception '% %: variant #% not found for user #%',
            action_name, tabled_name, p_variant_id, p_user_id
            using errcode = 'no_data_found', detail = 'variant_id';
    end if;

    -- Step 03: Return the result; null expiry rows are deleted and skipped
    return query select expiry.variant_id   as variant_id,
                        expiry.store_mode   as store_mode,
                        expiry.expiry_days  as expiry_days
                 from
                     expiry
                 where
                     expiry.variant_id = p_variant_id and expiry.expiry_days is not null
                 order by
                     expiry.store_mode;

        get diagnostics v_row_count = row_count;

    -- Step 04: Log successful operation
    perform usp_log_operation (
        p_user_id       := p_user_id,
        p_action        := action_name,
        p_table_name    := tabled_name,
        p_row_id        := p_variant_id,
        p_details       := jsonb_build_object('expiry_count', v_row_count)
    );
end;
$$;

--  ================================================= END OF FILE ==================================================  --

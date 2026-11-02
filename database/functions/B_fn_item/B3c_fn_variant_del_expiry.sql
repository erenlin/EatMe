--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    B3c. ITEM DEL EXPIRY                                                                                            --
--  ================================================================================================================  --

--    Deletes the shelf life of a variant for one storage mode by setting it to null.
--    The variant must belong to the user.
--    The default store mode's expiry cannot be deleted, as it is the one row guaranteed to exist;
--    change it with usp_item_set_expiry instead.

create or replace function usp_variant_del_expiry (
    p_user_id       int,
    p_variant_id    int,
    p_store_mode    store
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
    tabled_name             constant table_name := 'expiry';
    action_name             constant log_action := 'delete';

    v_default_store         store;
    v_old_expiry_days       smallint;

    v_out_variant_id        int;
    v_out_store_mode        store;
    v_out_expiry_days       smallint;

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

    if p_store_mode is null then
        raise exception '% %: store mode is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'store_mode';
    end if;

    -- Step 02: Ownership check; the variant must exist and belong to the user
    select
        iv.default_store_mode
    into
        v_default_store
    from
        item_variants iv
    where
        iv.id = p_variant_id and iv.user_id = p_user_id;

    if not found then
        raise exception '% %: variant #% not found for user #%',
            action_name, tabled_name, p_variant_id, p_user_id
            using errcode = 'no_data_found', detail = 'variant_id';
    end if;

    -- Step 03: The default store mode's expiry is guaranteed and cannot be deleted
    if p_store_mode = v_default_store then
        raise exception '% %: % is the default store mode of variant #%; its expiry cannot be deleted',
            action_name, tabled_name, p_store_mode, p_variant_id
            using errcode = 'check_violation', detail = 'store_mode';
    end if;

    -- Step 04: Read and lock the current value; a missing or already-null row has nothing to delete
    select
        ex.expiry_days
    into
        v_old_expiry_days
    from
        expiry ex
    where
        ex.variant_id = p_variant_id and ex.store_mode = p_store_mode
    for update;

    if v_old_expiry_days is null then
        raise exception '% %: no % expiry set for variant #%',
            action_name, tabled_name, p_store_mode, p_variant_id
            using errcode = 'no_data_found', detail = 'store_mode';
    end if;

    -- Step 05: Clear the expiry
    update
        expiry
    set
        expiry_days = null
    where
        expiry.variant_id = p_variant_id and expiry.store_mode = p_store_mode
    returning
        expiry.variant_id,
        expiry.store_mode,
        expiry.expiry_days
    into
        v_out_variant_id,
        v_out_store_mode,
        v_out_expiry_days;

    -- Step 06: Log successful operation
    perform usp_log_operation (
        p_user_id       := p_user_id,
        p_action        := action_name,
        p_table_name    := tabled_name,
        p_row_id        := v_out_variant_id,
        p_details       := jsonb_build_object(
            'store_mode',       v_out_store_mode,
            'old_expiry_days',  v_old_expiry_days
        )
    );

    -- Step 07: Return the result
    return query select v_out_variant_id   as variant_id,
                        v_out_store_mode   as store_mode,
                        v_out_expiry_days  as expiry_days;
end;
$$;

--  ================================================= END OF FILE ==================================================  --

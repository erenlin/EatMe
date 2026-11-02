--  ================================================================================================================  --
--    B3b. ITEM SET EXPIRY                                                                                            --
--  ================================================================================================================  --

--    Sets the default shelf life of a variant for one storage mode.
--    The variant must belong to the user.
--    A variant keeps one expiry per storage mode, so an existing value (including a deleted null) is overwritten.
--    Logged as an insert when the row is new, and as an update when it overwrites an existing row.

create or replace function usp_variant_set_expiry (
    p_user_id       int,
    p_variant_id    int,
    p_store_mode    store,
    p_expiry_days   int
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
    action_name             constant log_action := 'update';

    v_existed               boolean;
    v_old_expiry_days       smallint;
    v_logged_action         log_action;

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

    if p_expiry_days is null then
        raise exception '% %: expiry days is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'expiry_days';
    end if;

    if p_expiry_days <= 0 or p_expiry_days > 3650 then
        raise exception '% %: expiry days must be between 1 and 3650, got %',
            action_name, tabled_name, p_expiry_days
            using errcode = 'check_violation', detail = 'expiry_days';
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

    -- Step 03: Read the current value, so the log records whether this is a new row or an overwrite
    select
        expiry.expiry_days
    into
        v_old_expiry_days
    from
        expiry
    where
        expiry.variant_id = p_variant_id
      and expiry.store_mode = p_store_mode;

    v_existed := found;
    v_logged_action := case when v_existed then 'update'::log_action else 'insert'::log_action end;

    -- Step 04: Upsert; one row per (variant, store mode), overwritten if it already exists
    insert into
        expiry (variant_id, store_mode, expiry_days)
    values
        (p_variant_id, p_store_mode, p_expiry_days::smallint)
    -- Conflict target named by constraint: the bare column names would clash with the output columns
    on conflict on constraint
        expiry_pkey
    do update set
        expiry_days = excluded.expiry_days
    returning
        expiry.variant_id,
        expiry.store_mode,
        expiry.expiry_days
    into
        v_out_variant_id,
        v_out_store_mode,
        v_out_expiry_days;

    -- Step 05: Log successful operation
    perform usp_log_operation (
        p_user_id       := p_user_id,
        p_action        := v_logged_action,
        p_table_name    := tabled_name,
        p_row_id        := v_out_variant_id,
        p_details       := jsonb_build_object (
            'store_mode',       v_out_store_mode,
            'old_expiry_days',  v_old_expiry_days,
            'new_expiry_days',  v_out_expiry_days
        )
    );

    -- Step 06: Return the result
    return query select v_out_variant_id   as variant_id,
                        v_out_store_mode   as store_mode,
                        v_out_expiry_days  as expiry_days;
end;
$$;

--  ================================================= END OF FILE ==================================================  --

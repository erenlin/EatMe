--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    C1b. INSTANCE ADD                                                                                               --
--  ================================================================================================================  --

--    Adds a purchase of one of the user's variants to their inventory. Quantity is in whole units; the unit
--    weight defaults to the variant's typical weight and the store mode to its default store mode.
--    The store mode must have an expiry set (usp_item_set_expiry), since the instance's expiry date is computed from it.

create or replace function usp_instance_add (
    p_user_id               int,
    p_variant_id            int,

    p_quantity              int             default 1,
    p_unit_weight_grams     int             default null,

    p_store_mode            store           default null,
    p_expiry_modifier       int             default 0,

    p_added_at              timestamptz     default null
)
    returns table
(
    instance_id             integer,
    variant_id              integer,

    quantity                integer,
    unit_weight_grams       integer,
    total_grams             integer,

    store_mode              store,
    expiry_modifier         smallint,

    added_at                timestamptz,
    expires_at              timestamptz
)
    language plpgsql
    volatile
    set search_path = kitchen, public
as $$
declare
    -- Constants identifying the table and action.
    tabled_name             constant table_name := 'item_instances';
    action_name             constant log_action := 'insert';

    v_typical_weight        int;
    v_default_store         store;
    v_store                 store;
    v_unit_weight           int;
    v_quantity              int         := coalesce(p_quantity, 1);
    v_modifier              int         := coalesce(p_expiry_modifier, 0);
    v_added_at              timestamptz := coalesce(p_added_at, now());
    v_expiry_days           smallint;

    v_out_instance_id       int;
    v_out_variant_id        int;
    v_out_store_mode        store;
    v_out_quantity          int;
    v_out_unit_weight       int;
    v_out_expiry_modifier   smallint;
    v_out_added_at          timestamptz;

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

    if v_quantity <= 0 then
        raise exception '% %: quantity must be greater than 0', action_name, tabled_name
            using errcode = 'check_violation', detail = 'quantity';
    end if;

    if p_unit_weight_grams is not null and p_unit_weight_grams <= 0 then
        raise exception '% %: unit weight must be greater than 0 g', action_name, tabled_name
            using errcode = 'check_violation', detail = 'unit_weight_grams';
    end if;

    if v_modifier not between -3650 and 3650 then
        raise exception '% %: expiry modifier must be between -3650 and 3650 days, got %',
            action_name, tabled_name, v_modifier
            using errcode = 'check_violation', detail = 'expiry_modifier';
    end if;

    if v_added_at > now() then
        raise exception '% %: added date cannot be in the future', action_name, tabled_name
            using errcode = 'check_violation', detail = 'added_at';
    end if;

    -- Step 02: Ownership check; the variant must exist and belong to the user
    select
        iv.typical_weight_grams,
        iv.default_store_mode
    into
        v_typical_weight,
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

    -- Step 03: Fill defaults from the variant; total grams must fit in an integer
    v_store       := coalesce(p_store_mode, v_default_store);
    v_unit_weight := coalesce(p_unit_weight_grams, v_typical_weight);

    if v_quantity::bigint * v_unit_weight > 2147483647 then  -- TODO: Global constants
        raise exception '% %: total weight (% x % g) is too large',
            action_name, tabled_name, v_quantity, v_unit_weight
            using errcode = 'check_violation', detail = 'quantity';
    end if;

    -- Step 04: The store mode must have an expiry; the app prompts for one and retries if not
    select
        expiry.expiry_days
    into
        v_expiry_days
    from
        expiry
    where
        expiry.variant_id = p_variant_id and expiry.store_mode = v_store;

    if v_expiry_days is null then
        raise exception '% %: no % expiry set for variant #%',
            action_name, tabled_name, v_store, p_variant_id
            using errcode = 'no_data_found', detail = 'store_mode';
    end if;

    -- Step 05: Insert new instance record
    begin
        insert into
            item_instances (variant_id, store_mode, quantity, unit_weight_grams, added_at, expiry_modifier)
        values
            (p_variant_id, v_store, v_quantity, v_unit_weight, v_added_at, v_modifier::smallint)
        returning
            item_instances.id,
            item_instances.variant_id,
            item_instances.store_mode,
            item_instances.quantity,
            item_instances.unit_weight_grams,
            item_instances.expiry_modifier,
            item_instances.added_at
        into
            v_out_instance_id,
            v_out_variant_id,
            v_out_store_mode,
            v_out_quantity,
            v_out_unit_weight,
            v_out_expiry_modifier,
            v_out_added_at;
    exception
        when foreign_key_violation then
            -- variant was deleted after the Step 02 check
            raise exception '% %: variant #% not found for user #%',
                action_name, tabled_name, p_variant_id, p_user_id
                using errcode = 'no_data_found', detail = 'variant_id';
    end;

    -- Step 06: Log successful operation
    perform usp_log_operation (
        p_user_id       := p_user_id,
        p_action        := action_name,
        p_table_name    := tabled_name,
        p_row_id        := v_out_instance_id,
        p_details       := jsonb_build_object (
            'variant_id',         v_out_variant_id,
            'store_mode',         v_out_store_mode,
            'quantity',           v_out_quantity,
            'unit_weight_grams',  v_out_unit_weight
        )
    );

    -- Step 07: Return the result; expiry = added date + shelf life + modifier
    return query select v_out_instance_id                   as instance_id,
                        v_out_variant_id                    as variant_id,
                        v_out_quantity                      as quantity,
                        v_out_unit_weight                   as unit_weight_grams,
                        v_out_quantity * v_out_unit_weight  as total_grams,
                        v_out_store_mode                    as store_mode,
                        v_out_expiry_modifier               as expiry_modifier,
                        v_out_added_at                      as added_at,
                        v_out_added_at + make_interval(days => v_expiry_days + v_out_expiry_modifier)
                                                            as expires_at;
end;
$$;

--  ================================================= END OF FILE ==================================================  --

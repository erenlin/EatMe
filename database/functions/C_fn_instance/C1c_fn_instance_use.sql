--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    C1c. INSTANCE USE                                                                                               --
--  ================================================================================================================  --

--    Consumes part of an active instance, in grams, by recording a 'consumed' row in item_consumption.
--    The instance must belong to the acting user, or to a user with an active grant to them (the same
--    instances usp_instance_get lists with p_include_shared). The app converts servings or units to grams
--    before calling. An instance is used up once its consumption rows add up to its total weight.

create or replace function usp_instance_use (
    p_user_id           int,
    p_instance_id       int,
    p_grams             int
)
    returns table
(
    consumption_id      int,
    instance_id         int,
    owner_user_id       int,

    grams_used          int,
    grams_consumed      int,
    grams_remaining     int
)
    language plpgsql
    volatile
    set search_path = kitchen, public
as $$
declare
    -- Constants identifying the table and action.
    tabled_name             constant table_name  := 'item_consumption';
    action_name             constant log_action  := 'insert';

    v_owner_user_id         int;
    v_total_grams           int;
    v_consumed_grams        int;
    v_remaining_grams       int;

    v_out_consumption_id    int;
    v_out_reason            consumption;

begin
    -- Step 01: Payload Validation
    if p_user_id is null then
        raise exception '% %: user id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'user_id';
    end if;

    if p_instance_id is null then
        raise exception '% %: instance id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'instance_id';
    end if;

    if p_grams is null or p_grams <= 0 then
        raise exception '% %: grams used must be greater than 0 g', action_name, tabled_name
            using errcode = 'check_violation', detail = 'grams';
    end if;

    -- Step 02: Access check through the variant: the user owns it, or the owner has an active grant to the user.
    --          Lock the instance so concurrent uses cannot overdraw it.
    select
        variant.user_id,
        instance.quantity * instance.unit_weight_grams
    into
        v_owner_user_id,
        v_total_grams
    from
        item_instances instance
            join item_variants variant on variant.id = instance.variant_id
    where
        instance.id = p_instance_id and (variant.user_id = p_user_id or
            exists (
                select
                    1
                from
                    users_share grant_row
                where
                    grant_row.grantor_user_id = variant.user_id and grant_row.grantee_user_id = p_user_id and grant_row.revoked_at is null
            )
        )
        for
            update of instance;

    if not found then
        raise exception '% %: instance #% not found for user #%',
            action_name, tabled_name, p_instance_id, p_user_id
            using errcode = 'no_data_found', detail = 'instance_id';
    end if;

    -- Step 03: Total used so far; safe to sum because the instance is locked
    select
        coalesce(sum(consumption.grams), 0)
    into
        v_consumed_grams
    from
        item_consumption consumption
    where
        consumption.instance_id = p_instance_id;

    -- Step 04: Cannot use more than what is left; a used-up instance has 0 g left
    v_remaining_grams := v_total_grams - v_consumed_grams;

    if p_grams > v_remaining_grams then
        raise exception '% %: cannot use % g from instance #%, only % g left',
            action_name, tabled_name, p_grams, p_instance_id, v_remaining_grams
            using errcode = 'check_violation', detail = 'grams';
    end if;

    -- Step 05: Record the use; reason is left to its 'consumed' default
    insert into
        item_consumption (instance_id, user_id, grams)
    values
        (p_instance_id, p_user_id, p_grams)
    returning
        item_consumption.id,
        item_consumption.reason
    into
        v_out_consumption_id,
        v_out_reason;

    v_consumed_grams := v_consumed_grams + p_grams;

    -- Step 06: Log successful operation; the acting user is logged, with the owner in the details
    perform usp_log_operation (
        p_user_id       := p_user_id,
        p_action        := action_name,
        p_table_name    := tabled_name,
        p_row_id        := v_out_consumption_id,
        p_details       := jsonb_build_object(
            'instance_id',      p_instance_id,
            'owner_user_id',    v_owner_user_id,
            'reason',           v_out_reason,
            'grams_used',       p_grams,
            'grams_consumed',   v_consumed_grams,
            'grams_remaining',  v_total_grams - v_consumed_grams
       )
    );

    -- Step 07: Return the result
    return query select v_out_consumption_id              as consumption_id,
                        p_instance_id                     as instance_id,
                        v_owner_user_id                   as owner_user_id,
                        p_grams                           as grams_used,
                        v_consumed_grams                  as grams_consumed,
                        v_total_grams - v_consumed_grams  as grams_remaining;
end;
$$;

--  ================================================= END OF FILE ==================================================  --

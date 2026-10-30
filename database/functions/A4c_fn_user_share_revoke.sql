--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    A4c. USER SHARE REVOKE                                                                                          --
--  ================================================================================================================  --

create or replace function usp_revoke_share (
    rarg_user_id        int,
    rarg_grant_id       int
)
    returns table
(
    returned_grant_id           int,
    returned_grantee_user_id    int,
    returned_revoked_at         timestamptz
)
as $$
declare
    -- Constants identifying the table and action.
    tabled_name         constant table_name := 'users_share';
    action_name         constant log_action := 'revoke';

    v_grantor_id        int;
    v_revoked_at        timestamptz;
    v_out_grantee_id    int;
    v_out_revoked_at    timestamptz;

begin
    -- Step 01: Payload Validation
    if rarg_user_id is null or rarg_grant_id is null then
        raise exception '% %: user id and grant id are required', action_name, tabled_name
            using errcode = 'not_null_violation';
    end if;

    -- Step 02: Lock and inspect the grant
    select
        grantor_user_id,
        grantee_user_id,
        revoked_at
    into
        v_grantor_id,
        v_out_grantee_id,
        v_revoked_at
    from
        users_share
    where
        id = rarg_grant_id
        for update;

    -- Same error for "missing" and "not yours", so ids of other users' grants can't be probed
    if not found or v_grantor_id <> rarg_user_id then
        raise exception '% %: grant not found', action_name, tabled_name
            using errcode = 'no_data_found', detail = 'grant_id';
    end if;

    if v_revoked_at is not null then
        raise exception '% %: grant already revoked', action_name, tabled_name
            using errcode = 'object_not_in_prerequisite_state', detail = 'grant_id';
    end if;

    -- Step 03: Revoke the grant
    update
        users_share
    set
        revoked_at = now()
    where
        id = rarg_grant_id
    returning
        revoked_at into v_out_revoked_at;

    -- Step 04: Log successful operation
    perform usp_log_operation (
        p_user_id       := rarg_user_id,
        p_action        := action_name,
        p_table_name    := tabled_name,
        p_row_id        := rarg_grant_id,
        p_details       := jsonb_build_object('grantee_user_id', v_out_grantee_id)
    );

    -- Step 05: Return the result
    return query select rarg_grant_id     as returned_grant_id,
                        v_out_grantee_id  as returned_grantee_user_id,
                        v_out_revoked_at  as returned_revoked_at;
end;
$$ language plpgsql;

--  ================================================= END OF FILE ==================================================  --

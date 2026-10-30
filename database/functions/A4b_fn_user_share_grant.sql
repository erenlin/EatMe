--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    A4b. USER SHARE GRANT                                                                                           --
--  ================================================================================================================  --

create or replace function usp_grant_share (
    rarg_grantor_user_id    int,
    rarg_grantee_user_id    int
)
    returns table
(
    returned_grant_id           int,
    returned_grantee_user_id    int,
    returned_granted_at         timestamptz
)
as $$
declare
    -- Constants identifying the table and action.
    tabled_name             constant table_name := 'users_share';
    action_name             constant log_action := 'share';

    v_existing_grant_id     int;
    v_existing_granted_at   timestamptz;

    v_out_grant_id          int;
    v_out_grantee_id        int;
    v_out_granted_at        timestamptz;

begin
    -- Step 01: Payload Validation
    if rarg_grantor_user_id is null or rarg_grantee_user_id is null then
        raise exception '% %: grantor and grantee are required', action_name, tabled_name
            using errcode = 'not_null_violation';
    end if;

    if rarg_grantor_user_id = rarg_grantee_user_id then
        raise exception '% %: cannot share with yourself', action_name, tabled_name
            using errcode = 'check_violation', detail = 'grantee_user_id';
    end if;

    if not exists (select 1 from users where id = rarg_grantee_user_id) then
        raise exception '% %: grantee does not exist', action_name, tabled_name
            using errcode = 'foreign_key_violation', detail = 'grantee_user_id';
    end if;

    -- Step 02: Check for an existing active grant
    select
        id,
        created_at
    into
        v_existing_grant_id,
        v_existing_granted_at
    from
        users_share
    where
        grantor_user_id = rarg_grantor_user_id
      and grantee_user_id = rarg_grantee_user_id
      and revoked_at is null;

    if found then
        raise exception '% %: already shared with this user since % (grant #%)',
            action_name, tabled_name,
            to_char(v_existing_granted_at, 'MM/DD/YYYY'),
            v_existing_grant_id
            using errcode = 'unique_violation', detail = 'grantee_user_id';
    end if;

    -- Step 03: Insert new grant record
    insert into users_share (grantor_user_id, grantee_user_id)
    values (rarg_grantor_user_id, rarg_grantee_user_id)
    returning
        id,
        grantee_user_id,
        created_at
        into
            v_out_grant_id,
            v_out_grantee_id,
            v_out_granted_at;

    -- Step 04: Log successful operation
    perform usp_log_operation (
            p_user_id       := rarg_grantor_user_id,
            p_action        := action_name,
            p_table_name    := tabled_name,
            p_row_id        := v_out_grant_id,
            p_details       := jsonb_build_object('grantee_user_id', v_out_grantee_id)
    );

    -- Step 05: Return the result
    return query select v_out_grant_id   as returned_grant_id,
                        v_out_grantee_id as returned_grantee_user_id,
                        v_out_granted_at as returned_granted_at;
end;
$$ language plpgsql;

--  ================================================= END OF FILE ==================================================  --

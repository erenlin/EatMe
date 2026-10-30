--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    A4. USER SHARE FETCH                                                                                            --
--  ================================================================================================================  --

create or replace function usp_list_grants (
    rarg_user_id        int
)
    returns table
(
    returned_grant_id           int,
    returned_grantee_user_id    int,

    returned_grantee_first_name varchar,
    returned_grantee_last_name  varchar,
    returned_grantee_email      varchar,

    returned_granted_at         timestamptz,
    returned_revoked_at         timestamptz,
    returned_is_active          boolean
)
as $$
declare
    -- Constants identifying the table and action.
    tabled_name         constant table_name := 'users_share';
    action_name         constant log_action := 'select';

begin
    -- Step 01: Payload Validation
    if rarg_user_id is null then
        raise exception '% %: grantor user id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'user_id';
    end if;

    -- Step 02: Return grants table; active first (newest grant first), then revoked (newest revoke first)
    return query
        select
            us.id,
            us.grantee_user_id,

            u.first_name,
            u.last_name,
            u.email,

            us.created_at,
            us.revoked_at,
            us.revoked_at is null
        from
            users_share us
                join users u on u.id = us.grantee_user_id
        where
            us.grantor_user_id = rarg_user_id
        order by
            us.revoked_at is not null,
            coalesce(us.revoked_at, us.created_at) desc;

    end;
$$ language plpgsql;

--  ================================================= END OF FILE ==================================================  --

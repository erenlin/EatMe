--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    A2. USER LOGIN                                                                                                  --
--  ================================================================================================================  --

create or replace function usp_fetch_user (
    arg_email varchar
)
    returns table
(
    returned_user_id        int,
    returned_password_hash  text
)
as $$
declare
    -- Constants identifying the table and action
    tabled_name         constant table_name := 'users';
    action_name         constant log_action := 'login';

    v_email  varchar := lower(trim(arg_email));

begin
    -- Step 01: Payload Validation
    if v_email is null or v_email = '' then
        raise exception '% %: email is required', action_name, tabled_name;
    end if;

    -- Step 02: Return credentials; zero rows if the email is not registered
    return query
        select
            u.id            as returned_user_id,
            u.password_hash as returned_password_hash
        from
            users u
        where
            u.email = v_email;

end;
$$ language plpgsql;

--  ================================================= END OF FILE ==================================================  --

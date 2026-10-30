--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    A1. USER CREATE                                                                                                 --
--  ================================================================================================================  --

create or replace function usp_new_user (

    rarg_first_name     varchar,
    rarg_last_name      varchar,

    rarg_email          varchar,
    rarg_password_hash  text,

    arg_phone_number    varchar,
    rarg_date_of_birth  date,
    rarg_user_gender    gender
)
    returns table
(
    returned_user_id    int,
    returned_first_name varchar,
    returned_last_name  varchar,
    returned_email      varchar
)
as $$
declare
    -- Constants identifying the table and action.
    tabled_name         constant table_name := 'users';
    action_name         constant log_action := 'insert';

    v_email             varchar := lower(trim(rarg_email));
    v_out_user_id       int;
    v_out_first_name    varchar;
    v_out_last_name     varchar;
    v_out_email         varchar;

begin
    -- Step 01: Payload Validation
    if v_email is null or v_email = '' then
        raise exception '% %: email is required', action_name, tabled_name;
    end if;

    if rarg_date_of_birth > current_date then
        raise exception '% %: date of birth cannot be in the future', action_name, tabled_name;
    end if;

    -- Step 02: Check for duplicate email
    if exists (select 1 from users where email = v_email) then
        raise exception '% %: email already registered', action_name, tabled_name
            using errcode = 'unique_violation';
    end if;

    -- Step 03: Insert new user record
    insert into users (first_name, last_name,
                       email, password_hash,
                       phone_number, date_of_birth, user_gender)
    values (trim(rarg_first_name), trim(rarg_last_name),
            v_email, rarg_password_hash,
            nullif(trim(arg_phone_number), ''), rarg_date_of_birth, rarg_user_gender)
    returning
        id,
        first_name,
        last_name,
        email
    into
        v_out_user_id,
        v_out_first_name,
        v_out_last_name,
        v_out_email;

    -- Step 04: Log successful operation
    perform usp_log_operation (
        p_user_id       := v_out_user_id,
        p_action        := action_name,
        p_table_name    := tabled_name,
        p_row_id        := v_out_user_id,
        p_details       := jsonb_build_object('email', v_out_email)
    );

    -- Step 05: Return the result
    return query select v_out_user_id     as returned_user_id,
                        v_out_first_name  as returned_first_name,
                        v_out_last_name   as returned_last_name,
                        v_out_email       as returned_email;
end;
$$ language plpgsql;


select * from usp_new_user (
    rarg_first_name     => 'Test',
    rarg_last_name      => 'User',

    rarg_email          => 'test@example.com',
    rarg_password_hash  => crypt('password123', gen_salt('bf', 13)),

    arg_phone_number    => null,
    rarg_date_of_birth  => '2000-01-01',
    rarg_user_gender    => 'Male'
);

--  ================================================= END OF FILE ==================================================  --

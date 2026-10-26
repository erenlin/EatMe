create or replace function usp_new_user
(
    arg_first_name      varchar,    -- Payload
    arg_last_name       varchar,    -- Payload
    arg_email           varchar,    -- Payload
    arg_password_hash   text,       -- Payload (hashed by backend)
    arg_phone_number    varchar,    -- Payload
    arg_date_of_birth   date,       -- Payload
    arg_user_gender     gender      -- Payload
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
    -- Constants identifying the table and action
    tabled_name         constant varchar := 'USERS';
    action_name         constant varchar := 'INSERT';

    v_email             varchar := lower(trim(arg_email));
    v_user_id           int;
    v_first_name        varchar;
    v_last_name         varchar;
    v_out_email         varchar;

begin
    -- STEP 1: Validate payload
    if v_email is null or v_email = '' then
        raise exception '% %: email is required', action_name, tabled_name;
    end if;

    if arg_date_of_birth > current_date then
        raise exception '% %: date of birth cannot be in the future', action_name, tabled_name;
    end if;

    -- STEP 2: Check for duplicate email
    if exists (select 1 from users where email = v_email) then
        raise exception '% %: email already registered', action_name, tabled_name
            using errcode = 'unique_violation';
    end if;

    -- STEP 3A: Insert the new user record
    insert into users (first_name, last_name,
                       email, password_hash,
                       phone_number, date_of_birth, user_gender)
    values (trim(arg_first_name), trim(arg_last_name),
            v_email, arg_password_hash,
            nullif(trim(arg_phone_number), ''), arg_date_of_birth, arg_user_gender)
    returning
        id,
        first_name,
        last_name,
        email
        into
            v_user_id,
            v_first_name,
            v_last_name,
            v_out_email;

    -- STEP 3B: Return the result
    return query select v_user_id    as returned_user_id,
                        v_first_name as returned_first_name,
                        v_last_name  as returned_last_name,
                        v_out_email  as returned_email;
end;
$$ language plpgsql;


create or replace function usp_fetch_user
(
    arg_email  varchar   -- Target
)
    returns table
(
    returned_user_id        int,
    returned_password_hash  text
) as $$
declare
    -- Constants identifying the table and action
    tabled_name constant varchar := 'USERS';
    action_name constant varchar := 'SELECT';

    v_email  varchar := lower(trim(arg_email));

begin
    -- STEP 1: Validate target
    if v_email is null or v_email = '' then
        raise exception '% %: email is required', action_name, tabled_name;
    end if;

    -- STEP 2: Return credentials; zero rows if the email is not registered
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
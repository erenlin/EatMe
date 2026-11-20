set search_path = kitchen, public;

-- Automatically update a row's updated_at timestamp.
create or replace function set_modified_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- Keep user modification timestamps up to date.
create or replace trigger trg_users_modified_at
    before update on users
    for each row
    execute function set_modified_at();

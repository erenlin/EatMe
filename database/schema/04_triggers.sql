create or replace trigger trg_users_modified_at
    before update on users
    for each row execute function set_modified_at();
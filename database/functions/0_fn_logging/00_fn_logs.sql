--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    -. FUNCTION INITIALIZATION                                                                                      --
--  ================================================================================================================  --

create or replace function usp_log_operation (
    p_user_id           integer,
    p_action            log_action,

    p_table_name        table_name,
    p_row_id            integer default null,

    p_details           jsonb default null,
    p_successful        boolean default true
)
    returns integer
    language sql
    set search_path = kitchen, public
as $$
    insert into logs (user_id, action, table_name, row_id, details, successful)
    values (p_user_id, p_action, p_table_name, p_row_id, p_details, p_successful)
    returning id;
$$;

--  ================================================= END OF FILE ==================================================  --

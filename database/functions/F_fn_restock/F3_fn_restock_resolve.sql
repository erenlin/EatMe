--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    F3. RESTOCK RESOLVE                                                                                             --
--  ================================================================================================================  --

--    Checks items off the list by resolving open rows. Pass p_variant_id to clear one variant (every recipe that
--    wants it), p_recipe_id to clear one recipe (every variant it wants), or both to clear the one row.
--    At least one must be given. Returns the number of rows resolved; 0 when nothing was open.

create or replace function usp_restock_resolve (
    p_user_id       int,
    p_variant_id    int     default null,
    p_recipe_id     int     default null
)
    returns integer
    language plpgsql
    volatile
    set search_path = kitchen, public
as $$
declare
    -- Constants identifying the table and action.
    tabled_name     constant table_name := 'restock';
    action_name     constant log_action := 'update';

    v_row_count     int;

begin
    -- Step 01: Payload Validation
    if p_user_id is null then
        raise exception '% %: user id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'user_id';
    end if;

    if p_variant_id is null and p_recipe_id is null then
        raise exception '% %: a variant id or a recipe id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'variant_id';
    end if;

    -- Step 02: User must exist
    if not exists (
        select
            1
        from
            users
        where
            users.id = p_user_id
    ) then
        raise exception '% %: user #% not found',
            action_name, tabled_name, p_user_id
            using errcode = 'no_data_found', detail = 'user_id';
    end if;

    -- Step 03: Resolve matching open rows (scoped by user_id, so another user's ids simply match nothing)
    update
        restock
    set
        resolved_at = now()
    where
        restock.user_id = p_user_id
      and restock.resolved_at is null
      and (p_variant_id is null or restock.variant_id = p_variant_id)
      and (p_recipe_id  is null or restock.recipe_id  = p_recipe_id);

    get diagnostics v_row_count = row_count;

    -- Step 04: Log successful operation
    perform usp_log_operation (
            p_user_id       := p_user_id,
            p_action        := action_name,
            p_table_name    := tabled_name,
            p_row_id        := p_variant_id,
            p_details       := jsonb_build_object (
                    'variant_id',      p_variant_id,
                    'recipe_id',       p_recipe_id,
                    'resolved_count',  v_row_count
                               )
            );

    return v_row_count;
end;
$$;
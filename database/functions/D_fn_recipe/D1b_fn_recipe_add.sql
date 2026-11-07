--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    D1b. RECIPE ADD                                                                                                 --
--  ================================================================================================================  --

--    Creates a recipe header for the user: name, servings, instructions and creation date.
--    Names are trimmed; blank instructions are stored as null.
--    p_created_at falls back to now() when not given.
--    Returns the new recipe's id, for adding its ingredients.

create or replace function usp_recipe_add (
    p_user_id           int,
    p_recipe_name       varchar,
    p_servings          int,
    p_instructions      text            default null,
    p_created_at        timestamptz     default null
)
    returns integer
    language plpgsql
    volatile
    set search_path = kitchen, public
as $$
declare
    -- Constants identifying the table and action.
    tabled_name         constant table_name := 'recipes';
    action_name         constant log_action := 'insert';

    v_recipe_name       varchar     := nullif(btrim(p_recipe_name), '');
    v_instructions      text        := nullif(btrim(p_instructions), '');
    v_created_at        timestamptz := coalesce(p_created_at, now());

    v_recipe_id         integer;

begin
    -- Step 01: Payload Validation
    if p_user_id is null then
        raise exception '% %: user id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'user_id';
    end if;

    if v_recipe_name is null then
        raise exception '% %: recipe name is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'recipe_name';
    end if;

    if p_servings is null then
        raise exception '% %: servings is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'servings';
    end if;

    if p_servings not between 1 and 3650 then
        raise exception '% %: servings must be between 1 and 3650, got %',
            action_name, tabled_name, p_servings
            using errcode = 'check_violation', detail = 'servings';
    end if;

    -- Step 02: User must exist, and must not already own a recipe with this name
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

    if exists (
        select
            1
        from
            recipe
        where
            recipe.user_id = p_user_id and recipe.recipe_name = v_recipe_name
    ) then
        raise exception '% %: user #% already has a recipe named "%"',
            action_name, tabled_name, p_user_id, v_recipe_name
            using errcode = 'unique_violation', detail = 'recipe_name';
    end if;

    -- Step 03: Insert the recipe header
    insert into recipe (
        user_id,
        recipe_name,
        servings,
        instructions,
        created_at
    )
    values (
        p_user_id, v_recipe_name, p_servings::smallint, v_instructions, v_created_at)
    returning
        id
    into
        v_recipe_id;

    -- Step 04: Log successful operation
    perform usp_log_operation (
        p_user_id       := p_user_id,
        p_action        := action_name,
        p_table_name    := tabled_name,
        p_row_id        := v_recipe_id,
        p_details       := jsonb_build_object (
            'recipe_name',      v_recipe_name,
            'servings',         p_servings,
            'has_instructions', v_instructions is not null,
            'created_at',       v_created_at
        )
    );

    return v_recipe_id;
end;
$$;

--  ================================================= END OF FILE ==================================================  --

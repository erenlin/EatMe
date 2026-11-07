--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    D2b. RECIPE INGREDIENT ADD                                                                                      --
--  ================================================================================================================  --

--    Adds one of the user's variants to one of the user's recipes, with the grams used at the recipe's servings.
--    The recipe and the variant must both belong to the acting user; a variant can appear only once per recipe.
--    The ingredient takes the smallest unused position (from 0), filling gaps left by removed ingredients.
--    The recipe row is locked for the duration, so concurrent adds to the same recipe cannot claim the same position.
--    Returns the new recipe_ingredients id.

create or replace function usp_recipe_ingredient_add (
    p_user_id           int,
    p_recipe_id         int,
    p_variant_id        int,
    p_grams             int
)
    returns integer
    language plpgsql
    volatile
    set search_path = kitchen, public
as $$
declare
    -- Constants identifying the table and action.
    tabled_name         constant table_name := 'recipe_ingredients';
    action_name         constant log_action := 'insert';

    v_position          integer;
    v_ingredient_id     integer;

begin
    -- Step 01: Payload Validation
    if p_user_id is null then
        raise exception '% %: user id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'user_id';
    end if;

    if p_recipe_id is null then
        raise exception '% %: recipe id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'recipe_id';
    end if;

    if p_variant_id is null then
        raise exception '% %: variant id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'variant_id';
    end if;

    if p_grams is null then
        raise exception '% %: grams is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'grams';
    end if;

    if p_grams <= 0 then
        raise exception '% %: grams must be greater than 0, got %',
            action_name, tabled_name, p_grams
            using errcode = 'check_violation', detail = 'grams';
    end if;

    -- Step 02: Recipe ownership check; lock the recipe so position assignment is serialized
    perform
        1
    from
        recipe
    where
        recipe.id = p_recipe_id and recipe.user_id = p_user_id
    for update;

    if not found then
        raise exception '% %: recipe #% not found for user #%',
            action_name, tabled_name, p_recipe_id, p_user_id
            using errcode = 'no_data_found', detail = 'recipe_id';
    end if;

    -- Step 03: Variant ownership check
    if not exists (
        select
            1
        from
            item_variants variant
        where
            variant.id = p_variant_id and variant.user_id = p_user_id
    ) then
        raise exception '% %: variant #% not found for user #%',
            action_name, tabled_name, p_variant_id, p_user_id
            using errcode = 'no_data_found', detail = 'variant_id';
    end if;

    -- Step 04: Variant must not already be in the recipe
    if exists (
        select
            1
        from
            recipe_ingredients ingredient
        where
            ingredient.recipe_id = p_recipe_id and ingredient.variant_id = p_variant_id
    ) then
        raise exception '% %: variant #% is already in recipe #%',
            action_name, tabled_name, p_variant_id, p_recipe_id
            using errcode = 'unique_violation', detail = 'variant_id';
    end if;

    -- Step 05: Smallest unused position: 0, or the first slot right after a taken one that is itself free
    select
        min(slot.candidate)
    into
        v_position
    from (

        select 0 as candidate

        union all

        select
            taken.position + 1
        from
            recipe_ingredients taken
        where
            taken.recipe_id = p_recipe_id
        ) slot

    where not exists (

        select
            1
        from
            recipe_ingredients occupied
        where
            occupied.recipe_id = p_recipe_id and occupied.position = slot.candidate
        );

    if v_position > 3650 then
        raise exception '% %: recipe #% has no free positions left',
            action_name, tabled_name, p_recipe_id
            using errcode = 'program_limit_exceeded', detail = 'position';
    end if;

    -- Step 06: Insert the ingredient
    insert into recipe_ingredients (
        recipe_id,
        variant_id,
        user_id,
        grams,
        position
    ) values (
        p_recipe_id,
        p_variant_id,
        p_user_id,
        p_grams,
        v_position::smallint
    )
    returning
        id
    into
        v_ingredient_id;

    -- Step 07: Log successful operation
    perform usp_log_operation (
        p_user_id       := p_user_id,
        p_action        := action_name,
        p_table_name    := tabled_name,
        p_row_id        := v_ingredient_id,
        p_details       := jsonb_build_object (
            'recipe_id',    p_recipe_id,
            'variant_id',   p_variant_id,
            'grams',        p_grams,
            'position',     v_position
        )
    );

    return v_ingredient_id;
end;
$$;

--  ================================================= END OF FILE ==================================================  --

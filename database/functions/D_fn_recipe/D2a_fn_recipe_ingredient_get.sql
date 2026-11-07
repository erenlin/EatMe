--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    D2a. RECIPE INGREDIENT GET                                                                                      --
--  ================================================================================================================  --

--    Lists the ingredients of a recipe, in display order.
--    The recipe must belong to the acting user, or to a user who shares with the acting user (active grant).
--    Each row carries the variant's names and serving details, so the app can show grams as servings or units:
--      divisible: grams / serving_grams = servings
--      numerable: grams / typical_weight_grams = units
--    An empty recipe returns no rows; a recipe the user cannot access raises an error.

create or replace function usp_recipe_ingredient_get (
    p_user_id       int,
    p_recipe_id     int
)
    returns table
(
    ingredient_id           integer,
    recipe_id               integer,
    variant_id              integer,

    item_name               varchar,
    variant_name            varchar,

    grams                   integer,
    ingredient_position     smallint,

    counting_method         counting,
    typical_weight_grams    integer,
    serving_grams           integer
)
    language plpgsql
    volatile
    set search_path = kitchen, public
as $$
declare
    -- Constants identifying the table and action.
    tabled_name         constant table_name := 'recipe_ingredients';
    action_name         constant log_action := 'select';

    v_owner_id          int;
    v_row_count         int;

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

    -- Step 02: Access check; the recipe is the user's own, or its owner has an active grant to the user
    select
        header.user_id
    into
        v_owner_id
    from
        recipe header
    where
        header.id = p_recipe_id
        and (
            header.user_id = p_user_id
                or exists (
                    select
                        1
                    from
                        users_share grant_row
                    where
                        grant_row.grantor_user_id = header.user_id and grant_row.grantee_user_id = p_user_id and grant_row.revoked_at is null
            )
        );

    if not found then
        raise exception '% %: recipe #% not found for user #%',
            action_name, tabled_name, p_recipe_id, p_user_id
            using errcode = 'no_data_found', detail = 'recipe_id';
    end if;

    -- Step 03: Ingredients with their variant details, in display order
    return query
        select
            ingredient.id,
            ingredient.recipe_id,
            ingredient.variant_id,

            items.item_name,
            variant.variant_name,

            ingredient.grams,
            ingredient.position,

            variant.counting_method,
            variant.typical_weight_grams,
            variant.serving_grams
        from
            recipe_ingredients ingredient
                join item_variants variant on variant.id = ingredient.variant_id
                join items on items.id = variant.item_id
        where
            ingredient.recipe_id = p_recipe_id and ingredient.user_id = v_owner_id
        order by
            ingredient.position,
            ingredient.id;

    get diagnostics v_row_count = row_count;

    -- Step 04: Log successful operation
    perform usp_log_operation (
        p_user_id       := p_user_id,
        p_action        := action_name,
        p_table_name    := tabled_name,
        p_row_id        := p_recipe_id,
        p_details       := jsonb_build_object (
            'owner_id',         v_owner_id,
            'is_shared',        v_owner_id <> p_user_id,
            'ingredient_count', v_row_count
        )
    );
end;
$$;

--  ================================================= END OF FILE ==================================================  --

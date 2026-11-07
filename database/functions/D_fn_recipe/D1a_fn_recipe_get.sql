--  ================================================================================================================  --
--    -. TARGETING INITIALIZATION                                                                                     --
--  ================================================================================================================  --

set search_path = kitchen, public;

--  ================================================================================================================  --
--    D1a. RECIPE GET                                                                                                 --
--  ================================================================================================================  --

--    Lists the recipe headers of the user, ranked by how much of each recipe the available inventory covers.
--    With p_include_shared, it also lists the recipes of every user who shares with the acting user (active grants only).
--    With p_shared, the inventory of those users counts towards coverage as well as the acting user's own.
--
--    Inventory is matched to each ingredient line by variant:
--      the same variant always matches; another user's variant matches by name, kept when score >= 0.75:
--      score = 0.5 x item-name similarity + 0.5 x variant-name similarity (pg_trgm, case-insensitive).
--
--    Expired and used-up instances are left out; instances with no expiry set for their store mode still count.
--    Coverage, from 0 to 1 (null for a recipe with no ingredients):
--      p_weighted false: grams on hand / grams needed, each line capped at its need; own recipes first.
--      p_weighted true:  average of each line's min(on hand / needed, 1), every line equal; own and shared mixed.
--
--    Ties are sorted by name (case-insensitive). Results are paged, 50 per page; p_page starts at 1.
--    total_count is the full count across all pages.

create or replace function usp_recipe_get (
    p_user_id           int,
    p_include_shared    boolean     default false,
    p_shared            boolean     default false,
    p_weighted          boolean     default false,
    p_page              int         default 1
)
    returns table
(
    recipe_id           integer,
    user_id             integer,
    owner_name          varchar,
    is_own              boolean,

    recipe_name         varchar,
    servings            smallint,
    instructions        text,
    ingredient_count    integer,
    coverage_score      real,

    created_at          timestamptz,
    total_count         integer
)
    language plpgsql
    volatile
    set search_path = kitchen, public
as $$
declare
    -- Constants identifying the table and action.
    tabled_name         constant table_name := 'recipes';
    action_name         constant log_action := 'select';

    -- Constant page size and minimum name-match score for other users' variants.
    page_size           constant int        := 50;
    min_match_score     constant real       := 0.75;

    v_include_shared    boolean             := coalesce(p_include_shared, false);
    v_shared            boolean             := coalesce(p_shared, false);
    v_weighted          boolean             := coalesce(p_weighted, false);
    v_page              int                 := coalesce(p_page, 1);

    v_row_count         int;

begin
    -- Step 01: Payload Validation
    if p_user_id is null then
        raise exception '% %: user id is required', action_name, tabled_name
            using errcode = 'not_null_violation', detail = 'user_id';
    end if;

    if v_page < 1 then
        raise exception '% %: page must be 1 or greater, got %',
            action_name, tabled_name, v_page
            using errcode = 'check_violation', detail = 'page';
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

    -- Step 03: Recipes in scope, inventory in scope, coverage per recipe, then one page in ranked order
    return query

        with owners as (

            select  -- The acting user's recipes
                    p_user_id  as o_user_id,
                    true       as o_is_own

            union all

            select  -- Recipes of every user with an active grant to the acting user
                    grant_row.grantor_user_id,
                    false
            from
                users_share grant_row
            where
                v_include_shared and grant_row.grantee_user_id = p_user_id and grant_row.revoked_at is null
        ),

        pantry as (

            select  -- The acting user's inventory
                p_user_id  as m_user_id

            union all

            select  -- Inventory of every user with an active grant to the acting user
                grant_row.grantor_user_id
            from
                users_share grant_row
            where
                v_shared and grant_row.grantee_user_id = p_user_id and grant_row.revoked_at is null
        ),

        stock as (
            select  -- Grams on hand per variant: active, unexpired instances only
                stock_variant.id                   as k_variant_id,
                stock_variant.user_id              as k_user_id,
                lower(stock_item.item_name)        as k_item_name,
                lower(stock_variant.variant_name)  as k_variant_name,
                sum(instance.quantity::bigint * instance.unit_weight_grams - used.u_grams)
                                                   as k_grams
            from pantry
                inner join item_variants stock_variant on stock_variant.user_id = pantry.m_user_id
                inner join items stock_item on stock_item.id = stock_variant.item_id
                inner join item_instances instance on instance.variant_id = stock_variant.id
                left join expiry shelf on shelf.variant_id = instance.variant_id and shelf.store_mode = instance.store_mode

                cross join lateral (
                    select  -- Total used so far, by anyone, for any reason; 0 when nothing is recorded yet
                        coalesce(sum(consumption.grams), 0)::bigint as u_grams
                    from
                        item_consumption consumption
                    where
                        consumption.instance_id = instance.id
                ) used
            where
                used.u_grams < instance.quantity::bigint * instance.unit_weight_grams
            and (
                shelf.expiry_days is null or instance.added_at + make_interval(days => shelf.expiry_days::int + instance.expiry_modifier::int) > now()
            )
            group by
                stock_variant.id,
                stock_variant.user_id,
                stock_item.item_name,
                stock_variant.variant_name
        ),

        headers as (
            select
                header.id            as h_recipe_id,
                header.user_id       as h_user_id,
                (owner_row.first_name || ' ' || owner_row.last_name)::varchar
                                     as h_owner_name,
                owner.o_is_own       as h_is_own,

                header.recipe_name   as h_recipe_name,
                header.servings      as h_servings,
                header.instructions  as h_instructions,
                header.created_at    as h_created_at
            from
                owners owner
                    inner join recipe header on header.user_id = owner.o_user_id
                    inner join users owner_row on owner_row.id = owner.o_user_id
        ),

        line_rows as (
            select  -- Each ingredient line with the grams on hand that match it
                 head.h_recipe_id  as l_recipe_id,
                 ingredient.grams  as l_grams,
                 avail.a_grams     as l_available
            from
                headers head
                    inner join recipe_ingredients ingredient on ingredient.recipe_id = head.h_recipe_id
                    inner join item_variants line_variant on line_variant.id = ingredient.variant_id
                    inner join items line_item on line_item.id = line_variant.item_id

            cross join lateral (
                select  -- Same variant, or another user's variant whose names match closely enough
                    coalesce(sum(stock.k_grams), 0)::bigint as a_grams
                from
                    stock
                where
                    stock.k_variant_id = ingredient.variant_id
                or (
                    stock.k_user_id <> line_variant.user_id
                        and 0.5 * similarity(stock.k_item_name, lower(line_item.item_name)) + 0.5 * similarity(stock.k_variant_name, lower(line_variant.variant_name)) >= min_match_score
                )
            ) avail
        ),

        scores as (
            select
                line.l_recipe_id  as s_recipe_id,
                count(*)::int     as s_ingredient_count,

                -- Grams on hand / grams needed, each line capped at its need
                (sum(least(line.l_available, line.l_grams))::numeric / sum(line.l_grams))::real
                                  as s_grams_coverage,

                -- Average of each line's fill ratio, every line equal
                avg(least(line.l_available::numeric / line.l_grams, 1))::real
                                  as s_line_coverage
        from
            line_rows line
        group by
            line.l_recipe_id
        ),

        results as (
            select
                head.h_recipe_id                                    as r_recipe_id,
                head.h_user_id                                      as r_user_id,
                head.h_owner_name                                   as r_owner_name,
                head.h_is_own                                       as r_is_own,

                head.h_recipe_name                                  as r_recipe_name,
                head.h_servings                                     as r_servings,
                head.h_instructions                                 as r_instructions,
                coalesce(score.s_ingredient_count, 0)               as r_ingredient_count,
                case
                    when v_weighted then score.s_line_coverage
                else
                    score.s_grams_coverage
                end                                                 as r_coverage,

                head.h_created_at                                   as r_created_at,

                -- Computed before limit/offset, so it counts every matching recipe
                (count(*) over ())::int                             as r_total_count
            from
                headers head
                    left join scores score on score.s_recipe_id = head.h_recipe_id
        )

        select
            res.r_recipe_id,
            res.r_user_id,
            res.r_owner_name,
            res.r_is_own,

            res.r_recipe_name,
            res.r_servings,
            res.r_instructions,
            res.r_ingredient_count,
            res.r_coverage,

            res.r_created_at,
            res.r_total_count
        from
            results res
        order by
            case when
                v_weighted then false
            else
                res.r_is_own end desc,
                res.r_coverage desc nulls last,
                lower(res.r_recipe_name),
                res.r_recipe_id
        limit
            page_size
            offset
            (v_page - 1)::bigint * page_size;

    get diagnostics v_row_count = row_count;

    -- Step 04: Log successful operation
    perform usp_log_operation (
        p_user_id       := p_user_id,
        p_action        := action_name,
        p_table_name    := tabled_name,
        p_row_id        := null,
        p_details       := jsonb_build_object (
            'include_shared',  v_include_shared,
            'shared',          v_shared,
            'weighted',        v_weighted,
            'page',            v_page,
            'recipe_count',    v_row_count
        )
    );
end;
$$;

--  ================================================= END OF FILE ==================================================  --

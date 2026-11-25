// Recipe calls (D1). Field names match backend/internal/controller/recipes.go
// and the Recipe struct in backend/internal/store/store.go.
import { request } from "./client";

// One ingredient line from GET /recipes (inside ingredient_lines).
// full: your own groceries cover it. conditional: yours fall short, but with groceries shared
// with you it's covered (only when the list is fetched with shared=true). partial: some of it.
export type IngredientLine = {
  name: string;
  status: "full" | "conditional" | "partial" | "none";
  needed_grams: number;
  own_grams: number; // your matching groceries
  shared_grams: number; // matching groceries of people who share with you
};

// One row from GET /recipes.
export type Recipe = {
  recipe_id: number;
  user_id: number;
  owner_name: string;
  is_own: boolean;
  recipe_name: string;
  servings: number;
  instructions: string | null;
  ingredient_count: number;
  ingredient_lines: IngredientLine[]; // per-ingredient coverage, sorted full→conditional→partial→none
  coverage_score: number | null; // how much of it your groceries cover
  created_at: string;
  total_count: number; // recipes across all pages
};

// What POST /recipes needs. servings must be 1 to 3650.
export type NewRecipe = {
  recipe_name: string;
  servings: number;
  instructions?: string;
};

// D1a: the user's recipes, best match with their groceries first.
// The backend has no name search, so the page filters this list itself.
// It returns up to RECIPES_PAGE_SIZE per page; page starts at 1.
export const RECIPES_PAGE_SIZE = 50;

export async function listRecipes(page = 1): Promise<Recipe[]> {
  return (await request<Recipe[]>(`/api/recipes?page=${page}`)) ?? [];
}

// Stop fetching after this many pages so a huge account can't flood the backend.
const MAX_SEARCH_PAGES = 20;

// Every recipe across all pages, in the backend's order. Used by search, since the
// backend has no name search. Fetches page 1, then the rest in parallel.
export async function listAllRecipes(): Promise<Recipe[]> {
  const first = await listRecipes(1);
  const total = first[0]?.total_count ?? 0;
  const pages = Math.min(MAX_SEARCH_PAGES, Math.ceil(total / RECIPES_PAGE_SIZE));
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => listRecipes(i + 2)),
  );
  // A recipe added mid-fetch can shift rows between pages; drop the repeats.
  const seen = new Set<number>();
  return [first, ...rest].flat().filter((r) => !seen.has(r.recipe_id) && seen.add(r.recipe_id));
}

// D1b: add a recipe. Returns the new recipe's id.
export async function addRecipe(input: NewRecipe): Promise<{ recipe_id: number }> {
  return request<{ recipe_id: number }>("/api/recipes", { method: "POST", body: input });
}

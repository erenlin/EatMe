// Recipe calls (D1). Field names match backend/internal/controller/recipes.go
// and the Recipe struct in backend/internal/store/store.go.
import { request } from "./client";

// One ingredient line from GET /recipes (inside ingredient_lines).
export type IngredientLine = {
  name: string;
  status: "full" | "partial" | "none";
  needed_grams: number;
  available_grams: number;
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
  ingredient_lines: IngredientLine[]; // per-ingredient coverage, sorted full→partial→none
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
// It returns 50 per page; we only ask for the first page for now.
export async function listRecipes(): Promise<Recipe[]> {
  return (await request<Recipe[]>("/api/recipes")) ?? [];
}

// D1b: add a recipe. Returns the new recipe's id.
export async function addRecipe(input: NewRecipe): Promise<{ recipe_id: number }> {
  return request<{ recipe_id: number }>("/api/recipes", { method: "POST", body: input });
}

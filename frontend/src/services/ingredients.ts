// Recipe ingredient calls (D2). Field names match backend/internal/controller/recipes.go
// and the Ingredient struct in backend/internal/store/store.go.
import { request } from "./client";

// One row from GET /recipes/{id}/ingredients.
export type Ingredient = {
  ingredient_id: number;
  recipe_id: number;
  variant_id: number;
  item_name: string; // "Apple"
  variant_name: string; // "Gala"
  grams: number; // amount for the whole recipe (all its servings)
  ingredient_position: number;
  counting_method: "divisible" | "numerable";
  typical_weight_grams: number; // weight of one unit, e.g. one apple
  serving_grams: number;
};

// D2a: a recipe's ingredients, in the order the backend gives them.
export async function listIngredients(recipeId: number): Promise<Ingredient[]> {
  return (await request<Ingredient[]>(`/api/recipes/${recipeId}/ingredients`)) ?? [];
}

// D2b: add one of the user's foods to one of the user's recipes.
// grams is the amount for the whole recipe, not per serving.
export function addIngredient(
  recipeId: number,
  variantId: number,
  grams: number,
): Promise<{ ingredient_id: number }> {
  return request<{ ingredient_id: number }>(`/api/recipes/${recipeId}/ingredients`, {
    method: "POST",
    body: { variant_id: variantId, grams },
  });
}

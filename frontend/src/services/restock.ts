// Shopping list calls (F1–F3). Field names match ShoppingItem and RestockLine in
// backend/internal/store/store.go and the handlers in controller/recipes.go.
import { request } from "./client";
import type { CountingMethod } from "./variants";

// One recipe that wants an item, inside ShoppingItem.recipes.
export type RestockRecipe = {
  recipe_id: number;
  recipe_name: string | null; // null if the recipe was deleted
  multiplier: number;
  grams: number;
};

// One row from GET /restock: one of your foods, totalled across every recipe that wants it.
export type ShoppingItem = {
  variant_id: number;
  item_name: string;
  variant_name: string;
  typical_weight_grams: number;
  counting_method: CountingMethod;
  icon_png: string | null;
  grams_needed: number;
  grams_on_hand: number; // unexpired, not used up
  grams_to_buy: number;
  units_to_buy: number; // grams_to_buy / typical weight, rounded up
  recipes: RestockRecipe[];
  oldest_created_at: string | null;
};

// One row from POST /recipes/{id}/restock: one ingredient line and what happened to it.
export type RestockLine = {
  restock_id: number | null;
  variant_id: number | null;
  item_name: string;
  variant_name: string;
  grams_needed: number;
  grams_on_hand: number;
  status: "added" | "no_variant"; // no_variant: you have no saved food with that name
};

// F1: put a recipe's ingredients on the list. Pressing it again for the same recipe
// replaces that recipe's rows, so a new multiplier doesn't stack.
export async function restockRecipe(recipeId: number, multiplier = 1): Promise<RestockLine[]> {
  return (
    (await request<RestockLine[]>(`/api/recipes/${recipeId}/restock`, {
      method: "POST",
      body: { multiplier },
    })) ?? []
  );
}

// F2: the shopping list. Items your groceries already cover are left out unless includeCovered.
export async function getShoppingList(includeCovered = false): Promise<ShoppingItem[]> {
  return (
    (await request<ShoppingItem[]>(`/api/restock?include_covered=${includeCovered}`)) ?? []
  );
}

// F3: check things off. One food (every recipe that wants it), or one recipe (everything it
// wants), or both for a single row. Returns how many rows were cleared.
export async function resolveRestock(target: {
  variant_id?: number;
  recipe_id?: number;
}): Promise<number> {
  const data = await request<{ resolved_count: number }>("/api/restock/resolve", {
    method: "POST",
    body: target,
  });
  return data?.resolved_count ?? 0;
}

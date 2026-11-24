// Cooking a recipe.
//   E1: find the groceries you can cook with   (GET  /instances/lookup)
//   E2: cook, taking grams out of them at once (POST /recipes/cook)
import { request } from "./client";

// One grocery from E1: a purchase you (or someone sharing with you) still has some of.
export type PantryInstance = {
  instance_id: number;
  variant_id: number;
  owner_user_id: number;
  owner_name: string;
  is_own: boolean; // false = shared with you by owner_name
  item_name: string;
  variant_name: string;
  store_mode: "room" | "fridge" | "freezer";
  quantity: number;
  unit_weight_grams: number;
  total_grams: number;
  used_grams: number;
  remaining_grams: number;
  added_at: string;
  expires_at: string | null; // null = never expires in this storage spot
  is_expired: boolean;
};

export type LookupOptions = {
  query?: string; // search by "item variant" name; empty = everything
  variantId?: number; // only this food
  shared?: boolean; // also include groceries shared with you
  includeExpired?: boolean;
};

// E1: the backend already sorts the results: your own first, then soonest to expire.
export async function lookupInstances(options: LookupOptions = {}): Promise<PantryInstance[]> {
  const params = new URLSearchParams({ query: options.query ?? "" });
  if (options.shared) params.set("shared", "true");
  if (options.variantId !== undefined) params.set("variant_id", String(options.variantId));
  if (options.includeExpired) params.set("include_expired", "true");
  return (await request<PantryInstance[] | null>(`/api/instances/lookup?${params.toString()}`)) ?? [];
}

// One thing to take out of a grocery while cooking.
export type CookLine = { instance_id: number; grams: number };

// One row back from E2: what was taken, and what's left of that grocery.
export type CookResult = {
  consumption_id: number;
  instance_id: number;
  variant_id: number;
  owner_user_id: number;
  item_name: string;
  variant_name: string;
  grams_consumed: number;
  remaining_grams: number;
  consumed_at: string;
};

// E2: all lines are taken out together. If any line fails, nothing is taken.
export async function cookRecipe(recipeId: number, lines: CookLine[]): Promise<CookResult[]> {
  return (
    (await request<CookResult[] | null>("/api/recipes/cook", {
      method: "POST",
      body: { recipe_id: recipeId, lines },
    })) ?? []
  );
}

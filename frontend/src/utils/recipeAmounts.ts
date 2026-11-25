// Shared recipe math: scaling coverage by a multiplier, and turning grams into
// amounts people think in ("2 apples" instead of "360 g").
import type { CountingMethod } from "../services/variants";
import type { IngredientLine } from "../services/recipes";

// Re-compute coverage for each ingredient line scaled to a given multiplier.
// A multiplier of 2 means the user wants to make 2× the recipe.
// Same rules as the backend (D1a_fn_recipe_get.sql).
export function scaleLines(lines: IngredientLine[], multiplier: number): IngredientLine[] {
  return lines.map((l) => {
    const needed = l.needed_grams * multiplier;
    const own = l.own_grams ?? 0;
    const total = own + (l.shared_grams ?? 0);
    let status: IngredientLine["status"];
    if (own >= needed) status = "full";
    else if (total >= needed) status = "conditional";
    else if (total > 0) status = "partial";
    else status = "none";
    return { ...l, needed_grams: needed, status };
  });
}

// Grams on hand for a line, yours plus what's shared with you.
export const onHandGrams = (l: IngredientLine) => (l.own_grams ?? 0) + (l.shared_grams ?? 0);

// What we need to know about a food to describe an amount of it.
export type FoodSize = {
  counting_method: CountingMethod;
  typical_weight_grams: number; // one whole unit, e.g. one apple
  serving_grams: number;
};

// The units someone can type an amount in, for one food.
export type AmountUnit = "count" | "servings" | "grams";

export function unitsFor(food: FoodSize): AmountUnit[] {
  const units: AmountUnit[] = [];
  if (food.counting_method === "numerable" && food.typical_weight_grams > 0) units.push("count");
  if (food.serving_grams > 0) units.push("servings");
  units.push("grams");
  return units;
}

// Grams in one of the given unit.
export function gramsPer(unit: AmountUnit, food: FoodSize): number {
  if (unit === "count") return food.typical_weight_grams;
  if (unit === "servings") return food.serving_grams;
  return 1;
}

const round1 = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

// Things you count lead with the count: "2 whole (360 g)".
// Things you weigh lead with grams, plus servings when known: "720 g (3 servings)".
export function describeGrams(grams: number, food: FoodSize | undefined): string {
  const g = Math.round(grams);
  if (!food) return `${g} g`;
  if (food.counting_method === "numerable" && food.typical_weight_grams > 0) {
    return `${round1(grams / food.typical_weight_grams)} whole (${g} g)`;
  }
  if (food.serving_grams > 0) {
    const s = round1(grams / food.serving_grams);
    return `${g} g (${s} ${s === 1 ? "serving" : "servings"})`;
  }
  return `${g} g`;
}

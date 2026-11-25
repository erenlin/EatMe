import { describe, expect, test } from "vitest";
import { onHandGrams, scaleLines } from "./recipeAmounts";
import type { IngredientLine } from "../services/recipes";

// Shaped like an element of ingredient_lines from D1a_fn_recipe_get.sql.
const line = (own: number, shared: number, needed = 100): IngredientLine => ({
  name: "Apple - Gala",
  status: "none",
  needed_grams: needed,
  own_grams: own,
  shared_grams: shared,
});

describe("scaleLines", () => {
  test("sorts each line into full, conditional, partial or none", () => {
    const [full, conditional, partial, none] = scaleLines(
      [line(100, 0), line(40, 60), line(40, 0), line(0, 0)],
      1,
    );
    expect(full.status).toBe("full");
    expect(conditional.status).toBe("conditional");
    expect(partial.status).toBe("partial");
    expect(none.status).toBe("none");
  });

  test("scales the need by the multiplier", () => {
    const [l] = scaleLines([line(150, 0)], 2);
    expect(l.needed_grams).toBe(200);
    expect(l.status).toBe("partial");
  });

  test("on hand adds your groceries and shared ones, never NaN", () => {
    expect(onHandGrams(line(40, 60))).toBe(100);
    expect(onHandGrams({ name: "x", status: "none", needed_grams: 1 } as IngredientLine)).toBe(0);
  });
});

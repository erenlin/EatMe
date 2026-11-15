// How much of a grocery the "use" slider offers, shared by My Groceries and grocery details.

// The fields the slider needs from a grocery.
export type Usable = {
  grams_remaining: number;
  unit_weight_grams: number; // weight of one whole unit (one apple); 0 = not counted in units
  serving_grams: number; // 0 = no serving size set
};

// Slider range. Whole-unit foods snap to whole units (4 oranges at 130 g → 130/260/390/520).
// If less than one unit is left (half an apple), it falls back to 1 g steps so the
// slider can still reach what's actually there.
export function sliderRange(g: Usable): { min: number; max: number; step: number } {
  const max = Math.max(1, g.grams_remaining);
  const unit = g.unit_weight_grams;
  const step = unit > 0 && unit <= max ? unit : 1;
  return { min: step, max, step };
}

// Where the slider starts: one serving, else one unit, else 100 g, never more than is left.
export function defaultUseGrams(g: Usable): number {
  const max = g.grams_remaining;
  if (g.serving_grams > 0) return Math.min(g.serving_grams, max);
  if (g.unit_weight_grams > 0) return Math.min(g.unit_weight_grams, max);
  return Math.min(100, max);
}

// Keeps a remembered slider value inside the current range (it shrinks as food is used).
export function clampUseGrams(grams: number, g: Usable): number {
  const { min, max } = sliderRange(g);
  return Math.max(min, Math.min(grams, max));
}

// "≈2 units" or "≈1.5 servings" next to the grams; "" when neither is known.
export function useAmountLabel(grams: number, g: Usable): string {
  if (g.unit_weight_grams > 0) {
    const units = Math.round((grams / g.unit_weight_grams) * 10) / 10;
    return `≈${units} unit${units === 1 ? "" : "s"}`;
  }
  if (g.serving_grams > 0) {
    const servings = Math.round((grams / g.serving_grams) * 10) / 10;
    return `≈${servings} serving${servings === 1 ? "" : "s"}`;
  }
  return "";
}

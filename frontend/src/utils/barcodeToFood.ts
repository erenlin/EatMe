// Maps an Open Food Facts product to the fields AddPage's "new food" form uses.
// Storage mode and shelf life are guessed from category tags — not perfect, but
// good enough to save the user from having to look them up.

import type { OFFProduct } from "../services/openfoodfacts";
import type { StoreMode } from "../services/variants";

export type ScannedFoodFields = {
  name: string;
  kind: string;        // brand name → goes into the "Type" field
  store: StoreMode;
  days: number;
  sizeGrams: number;   // closest to serving or product weight, for the size picker
};

// Keywords that appear in OFF category tags (lowercased).
const FROZEN = ["frozen", "ice-cream", "ice-creams", "gelato", "sorbet"];
const FRIDGE = [
  "dairy", "milk", "yogurt", "yoghurt", "cheese", "butter", "cream",
  "meat", "poultry", "fish", "seafood", "deli", "fresh", "eggs",
  "refrigerat", "juices", "smoothie",
];

function guessStorage(categories: string): { store: StoreMode; days: number } {
  const c = categories.toLowerCase();
  if (FROZEN.some((k) => c.includes(k))) return { store: "freezer", days: 90 };
  if (FRIDGE.some((k) => c.includes(k))) return { store: "fridge", days: 7 };
  // Pantry default: shelf-stable packaged goods, produce, etc.
  return { store: "room", days: 30 };
}

// Pick the grams figure most useful for "size of one unit":
// prefer serving size for portion foods (cereal, yogurt), product weight otherwise.
function pickGrams(product: OFFProduct): number {
  const serving = product.servingGrams;
  const total = product.weightGrams;
  if (serving !== null && serving > 0) return Math.round(serving);
  if (total !== null && total > 0) return Math.round(total);
  return 150; // fall back to medium
}

export function offProductToFoodFields(product: OFFProduct): ScannedFoodFields {
  const { store, days } = guessStorage(product.categories);
  return {
    name: product.name,
    kind: product.brand,
    store,
    days,
    sizeGrams: pickGrams(product),
  };
}

// Maps arbitrary grams to AddPage's small/medium/large size options.
// (75 / 150 / 300 g — the user can always change it.)
export function closestSize(grams: number): "small" | "medium" | "large" {
  if (grams <= 112) return "small";
  if (grams <= 225) return "medium";
  return "large";
}

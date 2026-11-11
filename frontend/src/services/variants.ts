// Every variants call (B1b + B2b) lives here, so VariantsPage never builds URLs itself.
// It reuses request() from client.ts, which already attaches the login token
import { request } from "./client";

const VARIANTS_PATH = "/api/variants";

// How one unit is counted. "divisible" = you use part of one (a block of cheese).
// "numerable" = a serving is at least one whole unit (eggs).
export type CountingMethod = "divisible" | "numerable";

// Where the food is usually kept.
export type StoreMode = "room" | "fridge" | "freezer";

// One row from GET /variants.
export type Variant = {
  variant_id: number;
  variant_name: string;
  typical_weight_grams: number;
  serving_grams: number;
  counting_method: CountingMethod;
  default_store_mode: StoreMode;
  owner_user_id: number;
  created_at: string;
};

// What POST /variants needs. 
export type NewVariant = {
  item_id: number;
  variant_name: string;
  typical_weight_grams: number;
  serving_grams: number;
  default_expiry_days: number;
  counting_method?: CountingMethod;
  default_store_mode?: StoreMode;
};

// The backend might send the list on its own, or wrapped like { data: [...] }.
// This accepts either, so doesn't break if response shape differs.
function unwrapList(data: unknown): Variant[] {
  if (Array.isArray(data)) return data as Variant[];
  if (data && typeof data === "object") {
    for (const key of ["data", "variants", "results"]) {
      const inner = (data as Record<string, unknown>)[key];
      if (Array.isArray(inner)) return inner as Variant[];
    }
  }
  return [];
}

// B1b: list one item's variants. An empty query lists all of them.
export async function listVariants(itemId: number, query = ""): Promise<Variant[]> {
  const params = new URLSearchParams({ item_id: String(itemId) });
  // The database treats % and _ as wildcards, so we strip them out (Aaron's note).
  const cleaned = query.replace(/[%_]/g, "").trim();
  if (cleaned) params.set("query", cleaned);
  const data = await request<unknown>(`${VARIANTS_PATH}?${params.toString()}`);
  return unwrapList(data);
}

// B2b: add a new variant under one of the user's items.
export function addVariant(input: NewVariant): Promise<unknown> {
  return request(VARIANTS_PATH, { method: "POST", body: input });
}

// Checks the database's serving rule before sending, so the user sees a clear
// message instead of a generic 400. Returns an error message, or "" if it's fine.
export function checkServingRule(
  method: CountingMethod,
  typicalWeight: number,
  serving: number,
): string {
  if (!(typicalWeight > 0) || !(serving > 0)) {
    return "Weight and serving size must both be more than 0 grams.";
  }
  if (method === "divisible" && serving > typicalWeight) {
    return "If you use it a little at a time, one serving can't weigh more than the whole package.";
  }
  if (method === "numerable" && serving < typicalWeight) {
    return "If you use whole pieces, one serving has to be at least one whole piece.";
  }
  return "";
}

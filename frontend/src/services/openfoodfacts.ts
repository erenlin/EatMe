// Open Food Facts — free public API, no key needed.
// Given a barcode (UPC/EAN), returns basic product info to pre-fill the new food form.
// Returns null if the product isn't in their database or the request fails.

export type OFFProduct = {
  name: string;
  brand: string;
  weightGrams: number | null;   // total product weight
  servingGrams: number | null;  // one serving in grams
  categories: string;           // space-joined category tags, e.g. "en:dairy en:milk"
};

export async function lookupBarcode(barcode: string): Promise<OFFProduct | null> {
  const fields = "product_name,brands,product_quantity,serving_quantity,categories_tags";
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    // Network error or timeout — treat as not found.
    return null;
  }

  if (!res.ok) return null;

  const data = (await res.json()) as {
    status: number;
    product?: Record<string, unknown>;
  };

  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  const name = typeof p.product_name === "string" ? p.product_name.trim() : "";
  const brand = typeof p.brands === "string" ? p.brands.split(",")[0].trim() : "";
  const weightGrams = typeof p.product_quantity === "number" ? p.product_quantity : null;
  const servingGrams = typeof p.serving_quantity === "number" ? p.serving_quantity : null;
  const categories = Array.isArray(p.categories_tags)
    ? (p.categories_tags as string[]).join(" ")
    : "";

  if (!name) return null;

  return { name, brand, weightGrams, servingGrams, categories };
}

// Every food the user has saved, as "item + variant" rows (Apple – Gala).
// Used by the Add screen and by the recipe ingredient picker.
import { lookupItems } from "./items";
import { listVariants, type Variant } from "./variants";

export type Food = Variant & { item_name: string };

// WORKAROUND: there's no "list all variants" endpoint yet, so we load
// items -> each item's variants, and combine them into one list.
export async function loadAllFoods(): Promise<Food[]> {
  const items = (await lookupItems("")) ?? [];
  const lists = await Promise.all(
    items.map(async (item) => {
      const variants = (await listVariants(item.item_id, "")) ?? [];
      return variants.map((v) => ({ ...v, item_name: item.item_name }));
    }),
  );
  return lists
    .flat()
    .sort(
      (a, b) =>
        a.item_name.localeCompare(b.item_name) || a.variant_name.localeCompare(b.variant_name),
    );
}

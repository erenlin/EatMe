import { request } from "./client";
import { lookupItems } from "./items";
import { listVariants } from "./variants";


export type Instance = {
  instance_id: number;
  item_name: string; // e.g. "Apple" (the backend already sends it)
  variant_name: string;
  quantity: number;
  unit_weight_grams: number; // weight of one whole unit (one apple)
  store_mode: string;
  total_grams: number;
  grams_remaining: number;
  added_at: string;
  expires_at: string | null; // null when that storage spot has no shelf life
};

// What POST /instances sends back (a smaller set of fields).
export type AddedInstance = {
  instance_id: number;
  quantity: number;
  expires_at: string | null;
};

// What POST /instances/use sends back.
export type UseResult = {
  grams_used: number;
  grams_remaining: number; // 0 means it's all used up
};

// C1a: get the user's instances of one variant, soonest expiry first
export async function listInstances(variantId: number): Promise<Instance[]> {
  const path = `/api/variants/${variantId}/instances`;
  return request<Instance[]>(path);
}

// C1b: add a purchase of a variant to the fridge
export async function addInstance(variantId: number, quantity: number): Promise<AddedInstance> {
  return request<AddedInstance>("/api/instances", {
    method: "POST",
    body: { variant_id: variantId, quantity },
  });
}

// C1c: use up part of an instance, in grams
export async function consumeInstance(instanceId: number, grams: number): Promise<UseResult> {
  return request<UseResult>("/api/instances/use", {
    method: "POST",
    body: { instance_id: instanceId, grams },
  });
}

// Soonest expiry first; groceries with no expiry date go last.
function byExpiry(a: Instance, b: Instance): number {
  if (a.expires_at === b.expires_at) return 0;
  if (a.expires_at === null) return 1;
  if (b.expires_at === null) return -1;
  return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
}

// One grocery for the My Groceries page: an instance plus its variant's serving size
// (so "Use one" knows how many grams one serving is) and the ids it belongs to
// (so the details page can link back to the dictionary).
export type Grocery = Instance & { serving_grams: number; item_id: number; variant_id: number };

// Every grocery the user has, in one list.
// WORKAROUND: the backend has no "list all instances" endpoint yet, so we ask for
// items -> each item's variants -> each variant's instances, then combine them.
// When backend adds GET /instances, replace the body with one request.
export async function listAllInstances(): Promise<Grocery[]> {
  const items = (await lookupItems("")) ?? [];

  // All items' variants at once.
  const variantLists = await Promise.all(
    items.map(async (item) => {
      const rows = await listVariants(item.item_id, "");
      return rows.map((v) => ({ ...v, item_id: item.item_id }));
    }),
  );
  const variants = variantLists.flat();

  // All variants' instances at once, each tagged with its variant's serving size.
  const groceryLists = await Promise.all(
    variants.map(async (v) => {
      const rows = (await listInstances(v.variant_id)) ?? [];
      return rows.map((row) => ({
        ...row,
        serving_grams: v.serving_grams,
        item_id: v.item_id,
        variant_id: v.variant_id,
      }));
    }),
  );

  return groceryLists.flat().sort(byExpiry);
}

// One grocery by its instance id, or null if it's gone (all used up).
// WORKAROUND: no GET /instances/{id} yet, so this loads the whole list and picks one.
export async function getGrocery(instanceId: number): Promise<Grocery | null> {
  const all = await listAllInstances();
  return all.find((g) => g.instance_id === instanceId) ?? null;
}

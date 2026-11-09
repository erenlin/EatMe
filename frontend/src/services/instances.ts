import { request } from "./client";


export type Instance = {
  instance_id: number;
  variant_name: string;
  quantity: number;
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

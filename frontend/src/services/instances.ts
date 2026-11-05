import { request } from "./client";

export type Instance = {
    instance_id: number; 
    variant_name: string;
    quantity: number; 
    store_mode: string;
    added_at: string;
    expires_at: string || null;
};

// get the users instances, by variant id -> instances 
export async function listInstances(variantId: number): Promise<Instance[]> {
    const path = `/api/variants/${variantId}/instances`;
    return request<Instance[]>(path);
}

// create new item!
export async function createItem(item_name: string): Promise<Item> {
    return request<Item>("/api/items", {
        method: "POST",
        body: { item_name }
    });
}

// lorytest@example.com
// Test1234!
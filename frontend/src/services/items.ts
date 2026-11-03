import { request } from "./client";

export type Item = {
    item_id: number; 
    item_name: string;
    owner_user_id: number; 
};

// get the users items, filtered by search text 
export async function lookupItems(query: string): Promise<Item[]> {
    const path = `/api/items?query=${encodeURIComponent(query)}&shared=false`;
    return request<Item[]>(path);
}

// create new item!
export async function createItem(item_name: string): Promise<Item> {
    return request<Item>("/api/items", {
        method: "POST",
        body: { item_name }
    });
}
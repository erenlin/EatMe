import { beforeEach, describe, expect, test, vi } from "vitest";
import { listSharedInstances } from "./instances";
import { request } from "./client";

vi.mock("./client", () => ({
  request: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());

describe("shared inventory API", () => {
  test("requests all shared groceries in one call", async () => {
    const groceries = [{
      instance_id: 90,
      user_id: 6,
      variant_id: 30,
      owner_name: "Test Owner",
      item_name: "Kiwi",
      variant_name: "Organic",
      quantity: 1,
      unit_weight_grams: 100,
      store_mode: "fridge",
      total_grams: 100,
      grams_remaining: 100,
      added_at: "2026-11-19T00:00:00Z",
      expires_at: null,
    }];

    vi.mocked(request).mockResolvedValue(groceries);

    expect(await listSharedInstances()).toEqual(groceries);
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/api/instances/shared",
    );
  });

  test("handles an empty shared inventory", async () => {
    vi.mocked(request).mockResolvedValue([]);

    expect(await listSharedInstances()).toEqual([]);
  });

  test("propagates backend errors", async () => {
    vi.mocked(request).mockRejectedValue(new Error("Server unavailable"));

    await expect(listSharedInstances()).rejects.toThrow(
      "Server unavailable",
    );
  });
});

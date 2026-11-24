import { beforeEach, describe, expect, test, vi } from "vitest";
import { consumeInstance, listSharedInstances } from "./instances";
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

describe("inventory consumption API", () => {
  test("defaults to consumed for ordinary usage", async () => {
    vi.mocked(request).mockResolvedValue({
      grams_used: 25,
      grams_remaining: 75,
    });

    await consumeInstance(1, 25);

    expect(request).toHaveBeenCalledWith("/api/instances/use", {
      method: "POST",
      body: { instance_id: 1, grams: 25, reason: "consumed" },
    });
  });

  test("sends discarded when throwing food away", async () => {
    vi.mocked(request).mockResolvedValue({
      grams_used: 75,
      grams_remaining: 0,
    });

    await consumeInstance(1, 75, "discarded");

    expect(request).toHaveBeenCalledWith("/api/instances/use", {
      method: "POST",
      body: { instance_id: 1, grams: 75, reason: "discarded" },
    });
  });
});

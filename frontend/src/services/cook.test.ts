import { beforeEach, describe, expect, test, vi } from "vitest";
import { cookRecipe, lookupInstances } from "./cook";
import { request } from "./client";

vi.mock("./client", () => ({
  request: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());

describe("E1 instance lookup", () => {
  test("searches everything by default", async () => {
    vi.mocked(request).mockResolvedValue([]);

    await lookupInstances();

    expect(request).toHaveBeenCalledExactlyOnceWith("/api/instances/lookup?query=");
  });

  test("sends the search text, one food, and shared groceries", async () => {
    vi.mocked(request).mockResolvedValue([]);

    await lookupInstances({ query: "gala apple", variantId: 12, shared: true });

    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/api/instances/lookup?query=gala+apple&shared=true&variant_id=12",
    );
  });

  test("can include expired groceries", async () => {
    vi.mocked(request).mockResolvedValue([]);

    await lookupInstances({ includeExpired: true });

    expect(request).toHaveBeenCalledExactlyOnceWith("/api/instances/lookup?query=&include_expired=true");
  });

  test("treats an empty (null) response as no groceries", async () => {
    vi.mocked(request).mockResolvedValue(null);

    expect(await lookupInstances()).toEqual([]);
  });
});

describe("E2 recipe cook", () => {
  test("posts the recipe and every line in one request", async () => {
    const results = [{ consumption_id: 1, instance_id: 5, grams_consumed: 180, remaining_grams: 0 }];
    vi.mocked(request).mockResolvedValue(results);

    const lines = [
      { instance_id: 5, grams: 180 },
      { instance_id: 9, grams: 240 },
    ];
    expect(await cookRecipe(3, lines)).toEqual(results);
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/recipes/cook", {
      method: "POST",
      body: { recipe_id: 3, lines },
    });
  });

  test("passes backend errors on to the page", async () => {
    vi.mocked(request).mockRejectedValue(new Error("insufficient or expired inventory"));

    await expect(cookRecipe(3, [{ instance_id: 5, grams: 999 }])).rejects.toThrow(
      "insufficient or expired inventory",
    );
  });
});

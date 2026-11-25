import { describe, expect, test } from "vitest";
import type { PantryInstance } from "../services/cook";
import { expiryText, planDraws, toCookLines } from "./cookPlan";

// A grocery with sensible defaults; tests only set what matters to them.
function grocery(id: number, remaining: number, extra: Partial<PantryInstance> = {}): PantryInstance {
  return {
    instance_id: id,
    variant_id: 1,
    owner_user_id: 1,
    owner_name: "Me",
    is_own: true,
    item_name: "Apple",
    variant_name: "Gala",
    store_mode: "fridge",
    quantity: 1,
    unit_weight_grams: remaining,
    total_grams: remaining,
    used_grams: 0,
    remaining_grams: remaining,
    added_at: "2026-11-20T00:00:00Z",
    expires_at: "2026-11-30T00:00:00Z",
    is_expired: false,
    ...extra,
  };
}

describe("planDraws", () => {
  test("takes from groceries in order, so the soonest to expire goes first", () => {
    const plan = planDraws(300, [grocery(1, 180), grocery(2, 180)]);

    expect(plan.draws.map((d) => [d.instance.instance_id, d.grams])).toEqual([
      [1, 180],
      [2, 120],
    ]);
    expect(plan.shortGrams).toBe(0);
  });

  test("stops as soon as it has enough", () => {
    const plan = planDraws(100, [grocery(1, 180), grocery(2, 180)]);

    expect(plan.draws).toHaveLength(1);
    expect(plan.draws[0].grams).toBe(100);
  });

  test("skips expired and used-up groceries", () => {
    const plan = planDraws(100, [grocery(1, 180, { is_expired: true }), grocery(2, 0), grocery(3, 180)]);

    expect(plan.draws.map((d) => d.instance.instance_id)).toEqual([3]);
  });

  test("reports how much is missing when there isn't enough", () => {
    const plan = planDraws(500, [grocery(1, 180), grocery(2, 120)]);

    expect(plan.draws.reduce((sum, d) => sum + d.grams, 0)).toBe(300);
    expect(plan.shortGrams).toBe(200);
  });

  test("needs nothing for a zero or invalid amount", () => {
    expect(planDraws(0, [grocery(1, 180)])).toEqual({ draws: [], shortGrams: 0 });
    expect(planDraws(-5, [grocery(1, 180)])).toEqual({ draws: [], shortGrams: 0 });
  });
});

describe("toCookLines", () => {
  test("lists every grocery to take from", () => {
    const lines = toCookLines([planDraws(180, [grocery(1, 180)]), planDraws(50, [grocery(2, 100)])]);

    expect(lines).toEqual([
      { instance_id: 1, grams: 180 },
      { instance_id: 2, grams: 50 },
    ]);
  });

  test("adds up amounts from the same grocery, since the backend refuses duplicates", () => {
    const shared = grocery(7, 500);
    const lines = toCookLines([planDraws(100, [shared]), planDraws(150, [shared])]);

    expect(lines).toEqual([{ instance_id: 7, grams: 250 }]);
  });

  test("is empty when nothing is used", () => {
    expect(toCookLines([{ draws: [], shortGrams: 0 }])).toEqual([]);
  });
});

describe("expiryText", () => {
  const now = new Date("2026-11-23T12:00:00Z");

  test("counts the days left", () => {
    expect(expiryText(grocery(1, 1, { expires_at: "2026-11-26T12:00:00Z" }), now)).toBe("expires in 3 days");
    expect(expiryText(grocery(1, 1, { expires_at: "2026-11-24T12:00:00Z" }), now)).toBe("expires tomorrow");
    expect(expiryText(grocery(1, 1, { expires_at: "2026-11-23T17:00:00Z" }), now)).toBe("expires today");
  });

  test("handles expired and never-expiring groceries", () => {
    expect(expiryText(grocery(1, 1, { is_expired: true }), now)).toBe("expired");
    expect(expiryText(grocery(1, 1, { expires_at: null }), now)).toBe("doesn't expire");
  });
});

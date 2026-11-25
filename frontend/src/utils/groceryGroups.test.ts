import { beforeEach, describe, expect, test } from "vitest";
import { groupByExpiry, groupByFood, groupByWhere, loadGroupBy, saveGroupBy } from "./groceryGroups";

const NOW = Date.UTC(2026, 10, 16, 12);
const DAY = 24 * 60 * 60 * 1000;
const inDays = (d: number) => new Date(NOW + d * DAY).toISOString();

const g = (item_name: string, store_mode: string, days: number | null) => ({
  item_name,
  store_mode,
  expires_at: days === null ? null : inDays(days),
});

const milk = g("Milk", "fridge", 1);
const expired = g("Yogurt", "fridge", -1);
const bread = g("Bread", "room", 4);
const gala = g("Apple", "fridge", 5);
const fuji = g("Apple", "fridge", 12);
const peas = g("Peas", "freezer", 60);
const rice = g("Rice", "room", null);
const list = [expired, milk, bread, gala, fuji, peas, rice];

describe("groupByExpiry", () => {
  test("splits into use soon / this week / later, keeping order", () => {
    const sections = groupByExpiry(list, NOW);
    expect(sections.map((s) => s.title)).toEqual(["Use soon", "This week", "Later"]);
    expect(sections[0].items).toEqual([expired, milk]);
    expect(sections[1].items).toEqual([bread, gala]);
    expect(sections[2].items).toEqual([fuji, peas, rice]);
  });

  test("leaves out empty sections", () => {
    expect(groupByExpiry([rice], NOW).map((s) => s.key)).toEqual(["later"]);
    expect(groupByExpiry([], NOW)).toEqual([]);
  });
});

describe("groupByWhere", () => {
  test("always shows fridge, freezer, pantry, even when empty", () => {
    const sections = groupByWhere([milk, rice]);
    expect(sections.map((s) => s.title)).toEqual(["Fridge", "Freezer", "Pantry"]);
    expect(sections[1].items).toEqual([]);
    expect(sections[1].emptyText).toBe("Nothing in the freezer.");
  });

  test("an unknown storage spot goes to Other", () => {
    const odd = g("Wine", "cellar", null);
    const sections = groupByWhere([odd]);
    expect(sections.at(-1)).toMatchObject({ title: "Other", items: [odd] });
  });
});

describe("groupByFood", () => {
  test("puts every type of a food together, soonest food first", () => {
    const sections = groupByFood([milk, gala, bread, fuji]);
    expect(sections.map((s) => s.title)).toEqual(["Milk", "Apple", "Bread"]);
    expect(sections[1].items).toEqual([gala, fuji]);
  });

  test("matches names regardless of case", () => {
    expect(groupByFood([gala, g("apple", "fridge", 3)])).toHaveLength(1);
  });
});

describe("remembered grouping", () => {
  beforeEach(() => localStorage.clear());

  test("defaults to expiry and remembers a choice", () => {
    expect(loadGroupBy()).toBe("expiry");
    saveGroupBy("food");
    expect(loadGroupBy()).toBe("food");
  });

  test("ignores junk in storage", () => {
    localStorage.setItem("eatme.groceriesGroupBy", "banana");
    expect(loadGroupBy()).toBe("expiry");
  });
});

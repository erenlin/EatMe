// How the Groceries page groups its list: by expiry (default), where it's kept, or food.
// Pure functions so they can be tested without rendering anything.
import { daysLeft } from "./freshness";

export type GroupBy = "expiry" | "where" | "food";

export const GROUP_BY_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: "expiry", label: "Expiry" },
  { id: "where", label: "Where kept" },
  { id: "food", label: "Food" },
];

// The few fields grouping needs, so tests don't have to build whole groceries.
export type Groupable = {
  item_name: string;
  store_mode: string;
  expires_at: string | null;
};

export type Section<T> = {
  key: string;
  title: string;
  items: T[];
  emptyText?: string; // shown when the section is kept even though it's empty
};

// Use soon = expired or 2 days or less; this week = up to 7; later = the rest or no date.
export function groupByExpiry<T extends Groupable>(list: T[], now: number): Section<T>[] {
  const soon: T[] = [];
  const week: T[] = [];
  const later: T[] = [];
  for (const g of list) {
    const days = g.expires_at ? daysLeft(g.expires_at, now) : null;
    if (days !== null && days <= 2) soon.push(g);
    else if (days !== null && days <= 7) week.push(g);
    else later.push(g);
  }
  return [
    { key: "soon", title: "Use soon", items: soon },
    { key: "week", title: "This week", items: week },
    { key: "later", title: "Later", items: later },
  ].filter((s) => s.items.length > 0);
}

const PLACES: { mode: string; title: string }[] = [
  { mode: "fridge", title: "Fridge" },
  { mode: "freezer", title: "Freezer" },
  { mode: "room", title: "Pantry" },
];

// Fridge, freezer and pantry always show (an empty freezer is worth knowing about).
// Anything stored somewhere else lands in "Other", shown only if it has something.
export function groupByWhere<T extends Groupable>(list: T[]): Section<T>[] {
  const sections: Section<T>[] = PLACES.map((p) => ({
    key: p.mode,
    title: p.title,
    items: list.filter((g) => g.store_mode === p.mode),
    emptyText: `Nothing in the ${p.title.toLowerCase()}.`,
  }));
  const known = new Set(PLACES.map((p) => p.mode));
  const other = list.filter((g) => !known.has(g.store_mode));
  if (other.length > 0) sections.push({ key: "other", title: "Other", items: other });
  return sections;
}

// One section per food (all its types together), in the order the list already has them,
// so the food with the soonest-expiring type comes first.
export function groupByFood<T extends Groupable>(list: T[]): Section<T>[] {
  const byName = new Map<string, Section<T>>();
  for (const g of list) {
    const key = g.item_name.toLowerCase();
    let section = byName.get(key);
    if (!section) {
      section = { key, title: g.item_name, items: [] };
      byName.set(key, section);
    }
    section.items.push(g);
  }
  return [...byName.values()];
}

// The chosen grouping is a per-browser preference, like a remembered tab.
const KEY = "eatme.groceriesGroupBy";

export function loadGroupBy(): GroupBy {
  try {
    const v = localStorage.getItem(KEY);
    return v === "where" || v === "food" ? v : "expiry";
  } catch {
    return "expiry";
  }
}

export function saveGroupBy(v: GroupBy): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // storage blocked: the choice just won't be remembered
  }
}

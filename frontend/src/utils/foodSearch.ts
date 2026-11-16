// Name matching for the food picker, kept apart from the component so it can be tested.
import type { Food } from "../services/foods";

export function foodLabel(f: Food): string {
  return `${f.item_name} · ${f.variant_name}`;
}

// Foods whose name has every typed word in it, best (starts-with) first.
export function matchFoods(foods: Food[], query: string): Food[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return foods;
  const hits = foods.filter((f) => {
    const name = `${f.item_name} ${f.variant_name}`.toLowerCase();
    return words.every((w) => name.includes(w));
  });
  const first = words[0];
  const starts = (f: Food) =>
    f.item_name.toLowerCase().startsWith(first) || f.variant_name.toLowerCase().startsWith(first);
  return [...hits.filter(starts), ...hits.filter((f) => !starts(f))];
}

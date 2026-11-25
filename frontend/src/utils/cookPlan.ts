// Deciding which groceries to cook with.
// For each ingredient we take grams from its groceries in the order given
// (the backend sorts them: your own first, then the ones expiring soonest),
// so food that's about to go bad gets used first.
import type { CookLine, PantryInstance } from "../services/cook";

export type Draw = { instance: PantryInstance; grams: number };

export type IngredientPlan = {
  draws: Draw[];
  shortGrams: number; // how much is still missing after using everything available
};

// Take `neededGrams` from the groceries, in order, skipping expired or used-up ones.
export function planDraws(neededGrams: number, instances: PantryInstance[]): IngredientPlan {
  let left = Math.max(0, Math.round(neededGrams));
  const draws: Draw[] = [];
  for (const instance of instances) {
    if (left === 0) break;
    if (instance.is_expired || instance.remaining_grams <= 0) continue;
    const grams = Math.min(left, instance.remaining_grams);
    draws.push({ instance, grams });
    left -= grams;
  }
  return { draws, shortGrams: left };
}

// Turn every ingredient's draws into the list the backend needs.
// The backend refuses the same grocery twice, so amounts from one grocery are added together.
export function toCookLines(plans: IngredientPlan[]): CookLine[] {
  const byInstance = new Map<number, number>();
  for (const plan of plans) {
    for (const draw of plan.draws) {
      const id = draw.instance.instance_id;
      byInstance.set(id, (byInstance.get(id) ?? 0) + draw.grams);
    }
  }
  return [...byInstance].map(([instance_id, grams]) => ({ instance_id, grams }));
}

// "expires today", "expires in 3 days", "expired", or "doesn't expire".
export function expiryText(instance: PantryInstance, now = new Date()): string {
  if (instance.is_expired) return "expired";
  if (!instance.expires_at) return "doesn't expire";
  // Whole days left, rounded down: 3½ days left is "in 3 days", 5 hours left is "today".
  const days = Math.floor((new Date(instance.expires_at).getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return "expires today";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

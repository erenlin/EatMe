// Freshness math for grocery cards.
// "now" is always passed in (a timestamp in milliseconds), so these functions
// never call Date.now() themselves and give the same answer every render.

const DAY_MS = 24 * 60 * 60 * 1000;

// Days until expiry, rounded up: 1.2 days left -> 2, 0.5 -> 1.
// 0 or less means it has expired.
export function daysLeft(expiresAt: string, now: number): number {
  return Math.ceil((new Date(expiresAt).getTime() - now) / DAY_MS);
}

// How much of its life is left, from 0 to 100:
// (expiresAt - now) / (expiresAt - addedAt), as a percent.
export function freshnessPercent(addedAt: string, expiresAt: string, now: number): number {
  const added = new Date(addedAt).getTime();
  const expires = new Date(expiresAt).getTime();
  const lifespan = expires - added;
  if (!(lifespan > 0)) return 0; // bad or same-moment dates: treat as used up
  const percent = ((expires - now) / lifespan) * 100;
  return Math.min(100, Math.max(0, percent));
}

// Extra class for the freshness bar's color:
// red when it's about to expire, green while more than half its life is left,
// and the normal mauve in between.
export function barTone(urgent: boolean, percent: number): string {
  if (urgent) return " is-urgent";
  if (percent > 50) return " is-fresh";
  return "";
}

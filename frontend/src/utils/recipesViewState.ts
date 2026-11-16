// Remembers where the user was on Recipes for You (page, search text, multipliers)
// so opening a recipe and coming back doesn't reset everything.
// Kept in sessionStorage, like the login token: it lasts until the tab closes.
const KEY = "eatme.recipesView";

export type RecipesViewState = {
  page: number;
  search: string;
  multipliers: Record<number, number>;
};

const EMPTY: RecipesViewState = { page: 1, search: "", multipliers: {} };

export function loadRecipesView(): RecipesViewState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<RecipesViewState>;
    const page = Number.isInteger(parsed.page) && parsed.page! >= 1 ? parsed.page! : 1;
    const search = typeof parsed.search === "string" ? parsed.search : "";
    const multipliers: Record<number, number> = {};
    if (parsed.multipliers && typeof parsed.multipliers === "object") {
      for (const [id, m] of Object.entries(parsed.multipliers)) {
        if (Number.isInteger(m) && m >= 1 && m <= 10) multipliers[Number(id)] = m;
      }
    }
    return { page, search, multipliers };
  } catch {
    return EMPTY;
  }
}

export function saveRecipesView(state: RecipesViewState): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked or full: the page still works, it just won't remember.
  }
}

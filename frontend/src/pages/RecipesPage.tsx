// Recipes for You (D1): the user's recipes, a search box, and a simple add form.
// Tapping a recipe opens /recipes/{id} (the ingredients screen).
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ApiError } from "../services/client";
import { addRecipe, listRecipes, type IngredientLine, type Recipe } from "../services/recipes";
import "../styles/RecipesPage.css";

const MESSAGES: Record<number, string> = {
  400: "Enter a recipe name and 1 to 3650 servings.",
  401: "Your login expired. Log out and log back in.",
  409: "You already have a recipe with that name.",
};

// Turns any error into a sentence we can show on screen.
function messageFor(err: unknown): string {
  if (err instanceof ApiError) return MESSAGES[err.status] ?? err.message;
  return "Can't reach the server. Make sure the backend is running.";
}

// Stand-in "photo" colors. Each recipe always gets the same one.
const PHOTO_COLORS = ["#e8c7cc", "#c9d8c5", "#f1dcb5", "#c8d3e6", "#e3cfe6"];

// Segmented coverage bar: green for full, yellow for partial, red for missing.
function CoverageBar({ lines }: { lines: IngredientLine[] }) {
  const total = lines.length;
  if (total === 0) return null;
  const full = lines.filter((l) => l.status === "full").length;
  const partial = lines.filter((l) => l.status === "partial").length;
  const none = total - full - partial;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  const label = full === total
    ? "All ingredients on hand"
    : `${full} of ${total} ingredients on hand`;
  return (
    <span
      className="recipes-coverage"
      role="meter"
      aria-label={label}
      aria-valuenow={full}
      aria-valuemin={0}
      aria-valuemax={total}
      title={label}
    >
      {full > 0 && <span className="recipes-coverage-full" style={{ width: pct(full) }} />}
      {partial > 0 && <span className="recipes-coverage-partial" style={{ width: pct(partial) }} />}
      {none > 0 && <span className="recipes-coverage-none" style={{ width: pct(none) }} />}
    </span>
  );
}

export default function RecipesPage() {
  // ---- Sticky notes (what the page remembers) ----
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newServings, setNewServings] = useState("2");
  const [adding, setAdding] = useState(false);

  // ---- Load the recipes once, when the page opens ----
  useEffect(() => {
    listRecipes()
      .then((rows) => setRecipes(rows))
      .catch((err: unknown) => setError(messageFor(err)))
      .finally(() => setLoading(false));
  }, []);

  // ---- Add: send the new recipe, then reload the list ----
  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const name = newName.trim();
    const servings = Number(newServings);
    if (!name || !Number.isInteger(servings) || servings < 1 || servings > 3650) {
      setError(MESSAGES[400]);
      return;
    }
    setAdding(true);
    try {
      await addRecipe({ recipe_name: name, servings });
      setNewName("");
      setNewServings("2");
      setRecipes(await listRecipes()); // reload so the order matches the backend's
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setAdding(false);
    }
  }

  // ---- Search: filter the list we already have (no backend call) ----
  const query = search.trim().toLowerCase();
  const shown = query
    ? recipes.filter((r) => r.recipe_name.toLowerCase().includes(query))
    : recipes;

  // ---- What you see ----
  return (
    <main className="recipes">
      <h1 className="recipes-title">Recipes for You</h1>

      <label htmlFor="recipes-search" className="recipes-hidden">
        Search recipes
      </label>
      <input
        id="recipes-search"
        className="recipes-input recipes-search"
        type="search"
        placeholder="Search recipes"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <form className="recipes-add" onSubmit={handleAdd}>
        <label htmlFor="recipe-name" className="recipes-hidden">
          Recipe name
        </label>
        <input
          id="recipe-name"
          className="recipes-input"
          type="text"
          placeholder="New recipe, e.g. Fruit salad"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <label htmlFor="recipe-servings" className="recipes-servings-label">
          Servings
        </label>
        <input
          id="recipe-servings"
          className="recipes-input recipes-servings"
          type="number"
          min={1}
          max={3650}
          inputMode="numeric"
          value={newServings}
          onChange={(e) => setNewServings(e.target.value)}
        />
        <button type="submit" disabled={adding}>
          {adding ? "Adding…" : "Add"}
        </button>
      </form>

      {error && (
        <p className="recipes-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="recipes-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="recipes-empty">
          <h2>No recipes found</h2>
          <p>{recipes.length === 0 ? "Add your first recipe above." : "Try searching for another recipe."}</p>
        </div>
      ) : (
        <ul className="recipes-list">
          {shown.map((r) => (
            <li key={r.recipe_id}>
              <Link className="recipes-card" to={`/recipes/${r.recipe_id}`}>
                <span
                  className="recipes-photo"
                  style={{ background: PHOTO_COLORS[r.recipe_id % PHOTO_COLORS.length] }}
                  aria-hidden="true"
                />
                <span className="recipes-info">
                  <strong>{r.recipe_name}</strong>
                  <span className="recipes-meta">
                    {r.servings} {r.servings === 1 ? "serving" : "servings"} · {r.ingredient_count}{" "}
                    {r.ingredient_count === 1 ? "ingredient" : "ingredients"}
                  </span>
                  {r.ingredient_lines.length > 0 && (
                    <CoverageBar lines={r.ingredient_lines} />
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

// Recipe details (/recipes/:id): the recipe's ingredients (D2a) and a form to add one (D2b).
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ApiError } from "../services/client";
import { loadAllFoods, type Food } from "../services/foods";
import { addIngredient, listIngredients, type Ingredient } from "../services/ingredients";
import { listRecipes, type Recipe } from "../services/recipes";
import "../styles/RecipeDetailPage.css";

// Turns any error into a sentence we can show on screen.
function messageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "Can't reach the server. Make sure the backend is running.";
  if (err.status === 401) return "Your login expired. Log out and log back in.";
  if (err.status === 400) return "Pick a food and enter grams (1 or more).";
  if (err.status === 404) {
    return err.message.includes("variant")
      ? "That food wasn't found. Try refreshing the page."
      : "This recipe wasn't found.";
  }
  if (err.status === 409) {
    return err.message.includes("already")
      ? "That food is already in this recipe."
      : "This recipe can't hold any more ingredients.";
  }
  return err.message;
}

// "360 g" plus about how many units that is, like "(about 2)".
function amountText(ing: Ingredient): string {
  if (ing.typical_weight_grams <= 0) return `${ing.grams} g`;
  const units = ing.grams / ing.typical_weight_grams;
  const rounded = units >= 10 ? Math.round(units) : Math.round(units * 10) / 10;
  return `${ing.grams} g (about ${rounded})`;
}

export default function RecipeDetailPage() {
  const recipeId = Number(useParams().id);

  // ---- Sticky notes (what the page remembers) ----
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [variantId, setVariantId] = useState(""); // picked food, as text from the dropdown
  const [grams, setGrams] = useState("");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");

  // ---- Load the recipe, its ingredients, and the foods to pick from ----
  useEffect(() => {
    if (!Number.isInteger(recipeId) || recipeId <= 0) {
      Promise.resolve().then(() => {
        setLoadError("This recipe wasn't found.");
        setLoading(false);
      });
      return;
    }
    Promise.all([listRecipes(), listIngredients(recipeId), loadAllFoods()])
      .then(([recipes, rows, allFoods]) => {
        setRecipe(recipes.find((r) => r.recipe_id === recipeId) ?? null);
        setIngredients(rows);
        setFoods(allFoods);
      })
      .catch((err: unknown) => setLoadError(messageFor(err)))
      .finally(() => setLoading(false));
  }, [recipeId]);

  // ---- D2b: add the picked food with its grams ----
  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");

    const pickedId = Number(variantId);
    const amount = Number(grams);
    if (!pickedId) {
      setFormError("Pick a food to add.");
      return;
    }
    if (!Number.isInteger(amount) || amount < 1) {
      setFormError("Enter how many grams the recipe uses (a whole number, 1 or more).");
      return;
    }

    setAdding(true);
    try {
      await addIngredient(recipeId, pickedId, amount);
      setIngredients(await listIngredients(recipeId)); // reload so it shows in order
      setVariantId("");
      setGrams("");
    } catch (err) {
      setFormError(messageFor(err));
    } finally {
      setAdding(false);
    }
  }

  // Foods already in the recipe are left out of the dropdown.
  const usedIds = new Set(ingredients.map((i) => i.variant_id));
  const choices = foods.filter((f) => !usedIds.has(f.variant_id));
  const picked = foods.find((f) => f.variant_id === Number(variantId));
  // Only the owner can add ingredients; shared recipes are read-only.
  const canEdit = recipe ? recipe.is_own : true;

  // ---- What you see ----
  return (
    <main className="recipe">
      <Link to="/recipes" className="recipe-back">
        ← Recipes
      </Link>

      {loading ? (
        <p className="recipe-muted">Loading…</p>
      ) : loadError ? (
        <p className="recipe-error" role="alert">
          {loadError}
        </p>
      ) : (
        <>
          <h1 className="recipe-title">{recipe ? recipe.recipe_name : "Recipe"}</h1>
          {recipe && (
            <p className="recipe-muted">
              Serves {recipe.servings}
              {!recipe.is_own && ` · shared by ${recipe.owner_name}`}
            </p>
          )}

          {/* D2a: ingredients */}
          <h2 className="recipe-heading">Ingredients</h2>
          {ingredients.length === 0 ? (
            <p className="recipe-muted">No ingredients yet.</p>
          ) : (
            <ul className="recipe-list">
              {ingredients.map((ing) => (
                <li key={ing.ingredient_id} className="recipe-ingredient">
                  <strong>
                    {ing.item_name} – {ing.variant_name}
                  </strong>
                  <span>{amountText(ing)}</span>
                </li>
              ))}
            </ul>
          )}

          {recipe?.instructions && (
            <>
              <h2 className="recipe-heading">Instructions</h2>
              <p className="recipe-instructions">{recipe.instructions}</p>
            </>
          )}

          {/* D2b: add an ingredient */}
          {canEdit && (
            <>
              <h2 className="recipe-heading">Add an ingredient</h2>
              {foods.length === 0 ? (
                <p className="recipe-muted">
                  Save some foods in the <Link to="/dictionary">food dictionary</Link> first.
                </p>
              ) : (
                <form className="recipe-form" onSubmit={handleAdd} noValidate>
                  <p className="required-note">
                    <span className="req" aria-hidden="true">*</span> Required
                  </p>
                  <label htmlFor="ing-food">
                    Food <span className="req" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="ing-food"
                    required
                    aria-required="true"
                    value={variantId}
                    onChange={(e) => setVariantId(e.target.value)}
                  >
                    <option value="">Pick a food…</option>
                    {choices.map((f) => (
                      <option key={f.variant_id} value={f.variant_id}>
                        {f.item_name} – {f.variant_name}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="ing-grams">
                    Grams for the whole recipe <span className="req" aria-hidden="true">*</span>
                    {picked && (
                      <span className="recipe-hint">
                        {" "}
                        (1 {picked.variant_name} ≈ {picked.typical_weight_grams} g)
                      </span>
                    )}
                  </label>
                  <input
                    id="ing-grams"
                    required
                    aria-required="true"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    placeholder="e.g. 360"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                  />

                  {formError && (
                    <p className="recipe-error" role="alert">
                      {formError}
                    </p>
                  )}

                  <button type="submit" disabled={adding}>
                    {adding ? "Adding…" : "Add ingredient"}
                  </button>
                </form>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}

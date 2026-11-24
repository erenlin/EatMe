// Recipe details (/recipes/:id): the recipe's ingredients (D2a), what you have of each,
// a shopping list for what's missing, and a form to add an ingredient (D2b).
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router";
import CookPanel from "../components/CookPanel";
import FoodPicker from "../components/FoodPicker";
import { ApiError } from "../services/client";
import { loadAllFoods, type Food } from "../services/foods";
import { addIngredient, listIngredients, type Ingredient } from "../services/ingredients";
import { listAllRecipes, type IngredientLine, type Recipe } from "../services/recipes";
import {
  describeGrams,
  gramsPer,
  scaleLines,
  unitsFor,
  type AmountUnit,
} from "../utils/recipeAmounts";
import { loadRecipesView } from "../utils/recipesViewState";
import "../styles/RecipeDetailPage.css";

// Turns any error into a sentence we can show on screen.
function messageFor(err: unknown): string {
  if (!(err instanceof ApiError))
    return "Can't reach the server. Make sure the backend is running.";
  if (err.status === 401) return "Your login expired. Log out and log back in.";
  if (err.status === 400) return "Pick a food and enter an amount.";
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

// The backend names each coverage line "Item - Variant" (see D1a_fn_recipe_get.sql).
const lineKey = (item: string, variant: string) => `${item} - ${variant}`.toLowerCase();

const STATUS_TEXT: Record<IngredientLine["status"], string> = {
  full: "Have enough",
  partial: "Have some",
  none: "Missing",
};

const UNIT_LABEL: Record<AmountUnit, string> = {
  count: "how many",
  servings: "servings",
  grams: "grams",
};

const AMOUNT_ERROR: Record<AmountUnit, string> = {
  count: "Enter how many the recipe uses.",
  servings: "Enter how many servings the recipe uses.",
  grams: "Enter how many grams the recipe uses.",
};

// Shopping list as plain text, for pasting into notes or a message.
function listText(name: string, rows: { label: string; amount: string }[]): string {
  return [`Shopping list: ${name}`, ...rows.map((r) => `- ${r.label}: ${r.amount}`)].join("\n");
}

export default function RecipeDetailPage() {
  const recipeId = Number(useParams().id);
  const location = useLocation();
  const justCreated = Boolean((location.state as { justCreated?: boolean } | null)?.justCreated);
  // Same multiplier the user picked on the Recipes list (1× if none).
  const [multiplier] = useState(() => loadRecipesView().multipliers[recipeId] ?? 1);

  // ---- Sticky notes (what the page remembers) ----
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [variantId, setVariantId] = useState<number | null>(null); // picked food
  const [pickerKey, setPickerKey] = useState(0); // bump to clear the picker after an add
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<AmountUnit>("grams");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState(false);

  // ---- Load the recipe, its ingredients, and the foods to pick from ----
  useEffect(() => {
    if (!Number.isInteger(recipeId) || recipeId <= 0) {
      Promise.resolve().then(() => {
        setLoadError("This recipe wasn't found.");
        setLoading(false);
      });
      return;
    }
    // The recipe may be on any page of the list, so look through all of them.
    Promise.all([listAllRecipes(), listIngredients(recipeId), loadAllFoods()])
      .then(([recipes, rows, allFoods]) => {
        setRecipe(recipes.find((r) => r.recipe_id === recipeId) ?? null);
        setIngredients(rows);
        setFoods(allFoods);
      })
      .catch((err: unknown) => setLoadError(messageFor(err)))
      .finally(() => setLoading(false));
  }, [recipeId]);

  // Picking a food switches to the unit that suits it: count apples, weigh flour.
  function pickFood(id: number | null) {
    setVariantId(id);
    const food = foods.find((f) => f.variant_id === id);
    if (food) setUnit(unitsFor(food)[0]);
  }

  const picked = foods.find((f) => f.variant_id === variantId);
  const units: AmountUnit[] = picked ? unitsFor(picked) : ["grams"];
  const typed = Number(amount);
  const gramsFromInput =
    picked && amount !== "" && typed > 0 ? Math.round(typed * gramsPer(unit, picked)) : null;

  // ---- D2b: add the picked food with its amount (always saved as grams) ----
  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");

    if (variantId === null || !picked) {
      setFormError("Pick a food from the list.");
      return;
    }
    if (gramsFromInput === null || gramsFromInput < 1) {
      setFormError(AMOUNT_ERROR[unit]);
      return;
    }

    setAdding(true);
    try {
      await addIngredient(recipeId, variantId, gramsFromInput);
      // Reload the ingredients (so it shows in order) and the coverage (so it shows what you have).
      const [rows, recipes] = await Promise.all([listIngredients(recipeId), listAllRecipes()]);
      setIngredients(rows);
      setRecipe(recipes.find((r) => r.recipe_id === recipeId) ?? null);
      setVariantId(null);
      setPickerKey((k) => k + 1);
      setAmount("");
      setUnit("grams");
    } catch (err) {
      setFormError(messageFor(err));
    } finally {
      setAdding(false);
    }
  }

  // What you have of each ingredient, matched up by name and scaled by the multiplier.
  const coverage = new Map(
    scaleLines(recipe?.ingredient_lines ?? [], multiplier).map((l) => [l.name.toLowerCase(), l]),
  );
  const lineFor = (ing: Ingredient) => coverage.get(lineKey(ing.item_name, ing.variant_name));

  // Everything you don't have enough of, and how much more to get.
  const toBuy = ingredients.flatMap((ing) => {
    const line = lineFor(ing);
    if (!line || line.status === "full") return [];
    const short = line.needed_grams - Math.max(0, line.available_grams);
    return [
      {
        id: ing.ingredient_id,
        label: `${ing.item_name} · ${ing.variant_name}`,
        amount: describeGrams(short, ing),
      },
    ];
  });

  // After cooking, reload so "Have enough / Missing" and the shopping list update.
  function reloadRecipe() {
    Promise.all([listIngredients(recipeId), listAllRecipes()])
      .then(([rows, recipes]) => {
        setIngredients(rows);
        setRecipe(recipes.find((r) => r.recipe_id === recipeId) ?? null);
      })
      .catch(() => {});
  }

  async function copyList() {
    if (!recipe) return;
    try {
      await navigator.clipboard.writeText(listText(recipe.recipe_name, toBuy));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  // Foods already in the recipe are left out of the picker.
  const usedIds = new Set(ingredients.map((i) => i.variant_id));
  const choices = foods.filter((f) => !usedIds.has(f.variant_id));
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
              {multiplier > 1 ? `Making ${multiplier}× · ` : ""}
              Serves {recipe.servings * multiplier}
              {!recipe.is_own && ` · shared by ${recipe.owner_name}`}
            </p>
          )}

          {justCreated && ingredients.length === 0 && (
            <p className="recipe-welcome" role="status">
              Recipe added! Now add what goes in it below.
            </p>
          )}

          {/* D2a: ingredients, each with what you have of it */}
          <h2 className="recipe-heading">Ingredients</h2>
          {ingredients.length === 0 ? (
            <p className="recipe-muted">No ingredients yet.</p>
          ) : (
            <ul className="recipe-list">
              {ingredients.map((ing) => {
                const line = lineFor(ing);
                return (
                  <li key={ing.ingredient_id} className="recipe-ingredient">
                    <span className="recipe-ingredient-main">
                      <strong>
                        {ing.item_name} · {ing.variant_name}
                      </strong>
                      <span className="recipe-amount">
                        {describeGrams(ing.grams * multiplier, ing)}
                      </span>
                    </span>
                    {line && (
                      <span className={`recipe-status recipe-status-${line.status}`}>
                        <i aria-hidden="true" />
                        {STATUS_TEXT[line.status]}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* E1 + E2: cook it, using the groceries that expire soonest */}
          {ingredients.length > 0 && (
            <CookPanel
              recipeId={recipeId}
              ingredients={ingredients}
              multiplier={multiplier}
              onCooked={reloadRecipe}
            />
          )}

          {/* Shopping list: what's missing or short */}
          {ingredients.length > 0 && recipe && (
            <>
              <h2 className="recipe-heading">Shopping list</h2>
              {toBuy.length === 0 ? (
                <p className="recipe-muted">You have everything for this recipe.</p>
              ) : (
                <>
                  <ul className="recipe-shopping">
                    {toBuy.map((row) => (
                      <li key={row.id}>
                        <span>{row.label}</span>
                        <span className="recipe-amount">{row.amount}</span>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="recipe-copy" onClick={copyList}>
                    {copied ? "Copied!" : "Copy list"}
                  </button>
                </>
              )}
            </>
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
                  Add some foods to your <Link to="/dictionary">saved foods</Link> first.
                </p>
              ) : (
                <form className="recipe-form" onSubmit={handleAdd} noValidate>
                  <p className="required-note">
                    <span className="req" aria-hidden="true">
                      *
                    </span>{" "}
                    Required
                  </p>
                  <label htmlFor="ing-food">
                    Food{" "}
                    <span className="req" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <FoodPicker
                    key={pickerKey}
                    id="ing-food"
                    foods={choices}
                    selectedId={variantId}
                    onSelect={pickFood}
                    required
                  />

                  <label htmlFor="ing-amount">
                    Amount for the whole recipe{" "}
                    <span className="req" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <div className="recipe-amount-row">
                    <input
                      id="ing-amount"
                      required
                      aria-required="true"
                      type="number"
                      min={0}
                      step={unit === "grams" ? 1 : 0.5}
                      inputMode="decimal"
                      placeholder={unit === "grams" ? "e.g. 360" : "e.g. 2"}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    {units.length > 1 ? (
                      <select
                        aria-label="Unit"
                        value={unit}
                        onChange={(e) => setUnit(e.target.value as AmountUnit)}
                      >
                        {units.map((u) => (
                          <option key={u} value={u}>
                            {u === "count" && picked ? `× ${picked.item_name}` : UNIT_LABEL[u]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="recipe-unit">g</span>
                    )}
                  </div>
                  {picked && gramsFromInput !== null && unit !== "grams" && (
                    <p className="recipe-hint recipe-converted">= {gramsFromInput} g</p>
                  )}

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

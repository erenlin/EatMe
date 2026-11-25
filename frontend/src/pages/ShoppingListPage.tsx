// Shopping list (/shopping): everything the recipes you restocked still need, across all of them (F2).
// Tap "Got it" to check a food off (F3); it waits a few seconds so you can undo a mis-tap,
// because the backend can't un-check. Reached from the Recipes page and from a recipe's
// "Add to shopping list" button, not the bottom nav.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import ConfirmButton from "../components/ConfirmButton";
import FoodIcon from "../components/FoodIcon";
import { ApiError } from "../services/client";
import {
  getShoppingList,
  resolveRestock,
  type RestockRecipe,
  type ShoppingItem,
} from "../services/restock";
import "../styles/ShoppingListPage.css";

// How long a checked-off food waits before it's really cleared.
const UNDO_MS = 5000;

function messageFor(err: unknown): string {
  if (!(err instanceof ApiError))
    return "Can't reach the server. Make sure the backend is running.";
  if (err.status === 401) return "Your login expired. Log out and log back in.";
  return err.message;
}

const round1 = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
const counted = (it: ShoppingItem) => it.counting_method === "numerable";

// "3 to buy" for things you count, "250 g to buy" for things you weigh.
function toBuyText(it: ShoppingItem): string {
  if (it.grams_to_buy <= 0) return "You have enough";
  return counted(it) ? `${it.units_to_buy} to buy` : `${it.grams_to_buy} g to buy`;
}

function haveText(it: ShoppingItem): string {
  if (it.grams_on_hand <= 0) return "";
  return counted(it)
    ? `You have ${round1(it.grams_on_hand / it.typical_weight_grams)}`
    : `You have ${it.grams_on_hand} g`;
}

const recipeLabel = (r: RestockRecipe) =>
  `${r.recipe_name ?? "Deleted recipe"}${r.multiplier > 1 ? ` (${r.multiplier}×)` : ""}`;

// The list as plain text, for pasting into notes or a message.
function listText(items: ShoppingItem[]): string {
  return [
    "Shopping list",
    ...items.map((it) => {
      const amount = counted(it) ? `${it.units_to_buy}` : `${it.grams_to_buy} g`;
      return `- ${it.item_name} · ${it.variant_name}: ${amount}`;
    }),
  ].join("\n");
}

export default function ShoppingListPage() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [showCovered, setShowCovered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // The food waiting to be cleared, shown with an Undo button.
  const [pending, setPending] = useState<ShoppingItem | null>(null);
  const pendingRef = useRef<{ item: ShoppingItem; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  );

  useEffect(() => {
    getShoppingList(showCovered)
      .then((list) => {
        setItems(list);
        setError("");
      })
      .catch((err: unknown) => setError(messageFor(err)))
      .finally(() => setLoading(false));
  }, [showCovered]);

  // Really clear the pending food. On failure it comes back with an error.
  const flush = useCallback(async () => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    setPending(null);
    try {
      await resolveRestock({ variant_id: p.item.variant_id });
      setItems((list) => list.filter((it) => it.variant_id !== p.item.variant_id));
    } catch (err) {
      setError(`Couldn't check off ${p.item.item_name}. ${messageFor(err)}`);
    }
  }, []);

  // Leaving the page doesn't cancel a check-off; it just happens sooner.
  useEffect(() => () => void flush(), [flush]);

  function checkOff(item: ShoppingItem) {
    void flush(); // only one waits at a time
    setError("");
    pendingRef.current = { item, timer: setTimeout(() => void flush(), UNDO_MS) };
    setPending(item);
  }

  function undo() {
    if (pendingRef.current) clearTimeout(pendingRef.current.timer);
    pendingRef.current = null;
    setPending(null);
  }

  async function removeRecipe(recipe: RestockRecipe) {
    await flush();
    try {
      await resolveRestock({ recipe_id: recipe.recipe_id });
      setItems(await getShoppingList(showCovered));
    } catch (err) {
      setError(messageFor(err));
    }
  }

  const shown = items.filter((it) => it.variant_id !== pending?.variant_id);
  const toBuy = shown.filter((it) => it.grams_to_buy > 0);

  // Every recipe on the list, once each, in the order they first show up.
  const recipes = [
    ...new Map(items.flatMap((it) => it.recipes).map((r) => [r.recipe_id, r])).values(),
  ];

  async function copyList() {
    try {
      await navigator.clipboard.writeText(listText(toBuy));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="shopping">
      <Link to="/recipes" className="shopping-back">
        ← Recipes
      </Link>
      <h1 className="shopping-title">Shopping list</h1>

      {error && (
        <p className="shopping-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="shopping-muted">Loading…</p>
      ) : items.length === 0 && !showCovered ? (
        <div className="shopping-empty">
          <FoodIcon name="" size={48} className="shopping-empty-icon" />
          <p>Your shopping list is empty.</p>
          <p className="shopping-muted">
            Open a <Link to="/recipes">recipe</Link> and tap "Add to shopping list".
          </p>
        </div>
      ) : (
        <>
          <label className="shopping-toggle">
            <input
              type="checkbox"
              checked={showCovered}
              onChange={(e) => setShowCovered(e.target.checked)}
            />
            Show foods I already have enough of
          </label>

          {shown.length === 0 ? (
            <p className="shopping-muted">Nothing left to buy.</p>
          ) : (
            <ul className="shopping-list">
              {shown.map((it) => {
                const covered = it.grams_to_buy <= 0;
                const have = haveText(it);
                return (
                  <li
                    key={it.variant_id}
                    className={covered ? "shopping-card is-covered" : "shopping-card"}
                  >
                    <FoodIcon name={it.item_name} size={32} className="shopping-icon" />
                    <div className="shopping-info">
                      <strong className="shopping-name">{it.item_name}</strong>
                      <span className="shopping-variant">{it.variant_name}</span>
                      <span className="shopping-for">
                        For {it.recipes.map(recipeLabel).join(", ")}
                      </span>
                    </div>
                    <div className="shopping-side">
                      <span className="shopping-amount">{toBuyText(it)}</span>
                      {have && !covered && <span className="shopping-have">{have}</span>}
                      <button
                        type="button"
                        className="shopping-check"
                        onClick={() => checkOff(it)}
                        aria-label={`Got ${it.item_name} ${it.variant_name}`}
                      >
                        Got it
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="shopping-muted shopping-note">
            Expired groceries don't count toward what you have.
          </p>

          {toBuy.length > 0 && (
            <button type="button" className="shopping-copy" onClick={copyList}>
              {copied ? "Copied!" : "Copy list"}
            </button>
          )}

          {recipes.length > 0 && (
            <>
              <h2 className="shopping-heading">Recipes on this list</h2>
              <ul className="shopping-recipes">
                {recipes.map((r) => (
                  <li key={r.recipe_id}>
                    <Link to={`/recipes/${r.recipe_id}`}>{recipeLabel(r)}</Link>
                    <ConfirmButton
                      label="Remove"
                      question={`Take ${r.recipe_name ?? "this recipe"} off the list?`}
                      confirmLabel="Yes, remove"
                      className="shopping-remove"
                      onConfirm={() => void removeRecipe(r)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {pending && (
        <div className="shopping-toast" role="status">
          <span>Checked off {pending.item_name}</span>
          <button type="button" onClick={undo}>
            Undo
          </button>
        </div>
      )}
    </main>
  );
}

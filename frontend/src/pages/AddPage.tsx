// Add by name (/add): search for a food, enter how many, tap Add, and go back to My Groceries.
// Each result is a variant ("Apple – Gala"), because groceries attach to variants.
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError } from "../services/client";
import { addInstance } from "../services/instances";
import { lookupItems } from "../services/items";
import { listVariants, type Variant } from "../services/variants";
import "../styles/AddPage.css";

// One search result: a variant plus the name of its item.
type Food = Variant & { item_name: string };

// Turns any error into a sentence we can show on screen.
function messageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "Can't reach the server. Make sure the backend is running.";
  switch (err.status) {
    case 400:
      return "Enter how many you bought (a whole number, 1 or more).";
    case 401:
      return "Your login expired. Log out and log back in.";
    case 404:
      return "That food wasn't found. Try refreshing the page.";
    case 409:
      return "This food doesn't have a shelf life set yet, so we can't add it.";
    default:
      return err.message;
  }
}

// WORKAROUND: there's no "search all variants" endpoint yet, so we load every item's
// variants once (items -> variants) and search that list on the page.
async function loadAllFoods(): Promise<Food[]> {
  const items = (await lookupItems("")) ?? [];
  const lists = await Promise.all(
    items.map(async (item) => {
      const variants = (await listVariants(item.item_id, "")) ?? [];
      return variants.map((v) => ({ ...v, item_name: item.item_name }));
    }),
  );
  return lists
    .flat()
    .sort(
      (a, b) =>
        a.item_name.localeCompare(b.item_name) || a.variant_name.localeCompare(b.variant_name),
    );
}

export default function AddPage() {
  const navigate = useNavigate();

  // ---- Sticky notes (what the page remembers) ----
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<number, string>>({}); // variant_id -> typed amount
  const [busyId, setBusyId] = useState<number | null>(null);
  const [addError, setAddError] = useState<{ id: number; text: string } | null>(null);

  // ---- Load every food once, when the page opens ----
  useEffect(() => {
    loadAllFoods()
      .then((rows) => setFoods(rows))
      .catch((err: unknown) => setLoadError(messageFor(err)))
      .finally(() => setLoading(false));
  }, []);

  // ---- Search: match the item name or the variant name ----
  const query = search.trim().toLowerCase();
  const shown = query
    ? foods.filter(
        (f) =>
          f.item_name.toLowerCase().includes(query) ||
          f.variant_name.toLowerCase().includes(query) ||
          `${f.item_name} ${f.variant_name}`.toLowerCase().includes(query),
      )
    : foods;

  // ---- Add one food to the user's groceries, then go back to My Groceries ----
  async function handleAdd(e: FormEvent<HTMLFormElement>, food: Food) {
    e.preventDefault();
    setAddError(null);

    const typed = quantities[food.variant_id] ?? "1";
    const amount = Number(typed);
    if (!Number.isInteger(amount) || amount < 1 || amount > 999) {
      setAddError({ id: food.variant_id, text: "Enter how many you bought (1 to 999)." });
      return;
    }

    setBusyId(food.variant_id);
    try {
      await addInstance(food.variant_id, amount);
      navigate("/"); // My Groceries reloads and shows the new grocery
    } catch (err) {
      setAddError({ id: food.variant_id, text: messageFor(err) });
      setBusyId(null);
    }
  }

  // ---- What you see ----
  return (
    <main className="add">
      <header className="add-header">
        <Link to="/" className="add-back" aria-label="Back to My Groceries">
          ←
        </Link>
        <h1 className="add-title">Add a grocery</h1>
      </header>

      <label htmlFor="add-search" className="add-hidden">
        Search for a food
      </label>
      <input
        id="add-search"
        className="add-search"
        type="search"
        placeholder="Search, e.g. apple"
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loadError ? (
        <p className="add-error" role="alert">
          {loadError}
        </p>
      ) : loading ? (
        <p className="add-muted">Loading…</p>
      ) : foods.length === 0 ? (
        <div className="add-empty">
          <h2>No foods saved yet</h2>
          <p>
            Add foods in the <Link to="/dictionary">food dictionary</Link> first, then come back here.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <div className="add-empty">
          <h2>No matches found</h2>
          <p>Try another name, like "milk" or "gala".</p>
        </div>
      ) : (
        <ul className="add-list">
          {shown.map((food) => (
            <li key={food.variant_id} className="add-card">
              <form className="add-row" onSubmit={(e) => handleAdd(e, food)} noValidate>
                <div className="add-name">
                  <strong>
                    {food.item_name} – {food.variant_name}
                  </strong>
                  <span>
                    {food.typical_weight_grams} g each · {food.default_store_mode}
                  </span>
                </div>

                <label htmlFor={`qty-${food.variant_id}`} className="add-hidden">
                  How many {food.variant_name}
                </label>
                <input
                  id={`qty-${food.variant_id}`}
                  className="add-qty"
                  type="number"
                  min={1}
                  max={999}
                  inputMode="numeric"
                  value={quantities[food.variant_id] ?? "1"}
                  onChange={(e) =>
                    setQuantities((q) => ({ ...q, [food.variant_id]: e.target.value }))
                  }
                />
                <button type="submit" disabled={busyId !== null}>
                  {busyId === food.variant_id ? "Adding…" : "Add"}
                </button>
              </form>

              {addError?.id === food.variant_id && (
                <p className="add-error" role="alert">
                  {addError.text}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

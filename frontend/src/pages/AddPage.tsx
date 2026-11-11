// Add a grocery (/add).
//   1. Find a food you've saved, choose how many, tap Add.
//   2. Not saved yet? "Add it as a new food" creates it AND puts it in your groceries in one step,
//      so users never have to visit the Dictionary first. (User study: both testers got stuck here.)
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError } from "../services/client";
import { loadAllFoods, type Food } from "../services/foods";
import { addInstance } from "../services/instances";
import { createItem, lookupItems } from "../services/items";
import { addVariant, type StoreMode } from "../services/variants";
import "../styles/AddPage.css";

// Turns any error into a sentence we can show on screen.
function messageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "Can't reach the server. Make sure the backend is running.";
  switch (err.status) {
    case 400:
      return "Something in the form isn't filled in correctly.";
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

// Sizes instead of grams (testers didn't know grams). One "unit" = one whole food.
const SIZES = [
  { id: "small", label: "Small", grams: 75 },
  { id: "medium", label: "Medium", grams: 150 },
  { id: "large", label: "Large", grams: 300 },
] as const;
type SizeId = (typeof SIZES)[number]["id"];

const STORAGE: { id: StoreMode; label: string; days: number }[] = [
  { id: "fridge", label: "Fridge", days: 7 },
  { id: "room", label: "Counter / pantry", days: 7 },
  { id: "freezer", label: "Freezer", days: 90 },
];

// Red asterisk for required fields. Screen readers get "required" from the input itself.
function Req() {
  return (
    <span className="req" aria-hidden="true">
      *
    </span>
  );
}

export default function AddPage() {
  const navigate = useNavigate();

  // ---- Sticky notes: the saved-foods list ----
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<number, string>>({}); // variant_id -> typed amount
  const [busyId, setBusyId] = useState<number | null>(null);
  const [addError, setAddError] = useState<{ id: number; text: string } | null>(null);
  const [done, setDone] = useState(""); // "Added 2 Gala ✓" before going back

  // ---- Sticky notes: the "new food" form ----
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState("");
  const [newSize, setNewSize] = useState<SizeId>("medium");
  const [newStore, setNewStore] = useState<StoreMode>("fridge");
  const [newDays, setNewDays] = useState("7");
  const [newQty, setNewQty] = useState("1");
  const [newErrors, setNewErrors] = useState<Record<string, string>>({});
  const [newSaving, setNewSaving] = useState(false);

  // ---- Load every saved food once, when the page opens ----
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

  // Show the confirmation for a moment, then go back to My Groceries.
  function finish(message: string) {
    setDone(message);
    window.setTimeout(() => navigate("/"), 900);
  }

  // ---- Add a saved food ----
  async function handleAdd(e: FormEvent<HTMLFormElement>, food: Food) {
    e.preventDefault();
    setAddError(null);

    const amount = Number(quantities[food.variant_id] ?? "1");
    if (!Number.isInteger(amount) || amount < 1 || amount > 999) {
      setAddError({ id: food.variant_id, text: "Enter how many you bought (1 to 999)." });
      return;
    }

    setBusyId(food.variant_id);
    try {
      await addInstance(food.variant_id, amount);
      finish(`Added ${amount} ${food.variant_name} ${food.item_name} ✓`);
    } catch (err) {
      setAddError({ id: food.variant_id, text: messageFor(err) });
      setBusyId(null);
    }
  }

  // ---- Open the "new food" form, starting with whatever they searched for ----
  function openNewFood() {
    const typed = search.trim();
    setNewName(typed ? typed.charAt(0).toUpperCase() + typed.slice(1) : "");
    setNewErrors({});
    setShowNew(true);
  }

  // Picking a storage spot suggests how long food usually lasts there.
  function pickStorage(id: StoreMode) {
    setNewStore(id);
    setNewDays(String(STORAGE.find((s) => s.id === id)?.days ?? 7));
  }

  // ---- Create a new food and add it to the groceries in one go ----
  async function handleNewFood(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Check every required field and remember which ones are missing.
    const errors: Record<string, string> = {};
    const name = newName.trim();
    const days = Number(newDays);
    const qty = Number(newQty);
    if (!name) errors.name = "Enter the food's name.";
    if (!Number.isInteger(days) || days < 1 || days > 3650) errors.days = "Enter a number of days (1 or more).";
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) errors.qty = "Enter how many you bought (1 to 999).";
    setNewErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const grams = SIZES.find((s) => s.id === newSize)?.grams ?? 150;
    const kind = newKind.trim() || "Regular";

    setNewSaving(true);
    try {
      // 1) The food itself (e.g. "Peach"). If it already exists, reuse it.
      let itemId: number;
      try {
        itemId = (await createItem(name)).item_id;
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) throw err;
        const match = (await lookupItems(name)).find(
          (i) => i.item_name.toLowerCase() === name.toLowerCase(),
        );
        if (!match) throw err;
        itemId = match.item_id;
      }

      // 2) Its kind (e.g. "Yellow"), counted in whole ones so "Use one" means one peach.
      const variant = (await addVariant({
        item_id: itemId,
        variant_name: kind,
        typical_weight_grams: grams,
        serving_grams: grams,
        counting_method: "numerable",
        default_store_mode: newStore,
        default_expiry_days: days,
      })) as { variant_id: number };

      // 3) Put it in the groceries.
      await addInstance(variant.variant_id, qty);
      finish(`Added ${qty} ${name} ✓`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setNewErrors({ form: `You already have "${kind}" ${name} saved. Search for it above instead.` });
      } else {
        setNewErrors({ form: messageFor(err) });
      }
      setNewSaving(false);
    }
  }

  // ---- What you see ----
  if (done) {
    return (
      <main className="add">
        <p className="add-done" role="status">
          {done}
        </p>
      </main>
    );
  }

  return (
    <main className="add">
      <header className="add-header">
        <Link to="/" className="add-back" aria-label="Back to My Groceries">
          ←
        </Link>
        <h1 className="add-title">Add a grocery</h1>
      </header>

      <p className="add-intro">
        Find the food you bought, choose how many, and tap <strong>Add</strong>. New food? Add it at
        the bottom.
      </p>

      {!showNew && (
        <>
          <label htmlFor="add-search" className="add-hidden">
            Search your foods
          </label>
          <div className="add-search-wrap">
            <span className="add-search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              id="add-search"
              className="add-search"
              type="search"
              placeholder="Search, e.g. apple"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loadError ? (
            <p className="add-error" role="alert">
              {loadError}
            </p>
          ) : loading ? (
            <p className="add-muted">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="add-muted add-nomatch">
              {foods.length === 0
                ? "You haven't saved any foods yet."
                : `No saved food matches "${search.trim()}".`}
            </p>
          ) : (
            <ul className="add-list">
              {shown.map((food) => (
                <li key={food.variant_id} className="add-card">
                  <form className="add-row" onSubmit={(e) => handleAdd(e, food)} noValidate>
                    <div className="add-name">
                      <strong>
                        {food.item_name} – {food.variant_name}
                      </strong>
                      <span>Kept in the {food.default_store_mode === "room" ? "pantry" : food.default_store_mode}</span>
                    </div>

                    <label htmlFor={`qty-${food.variant_id}`} className="add-qty-label">
                      How many
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

          {!loading && !loadError && (
            <button type="button" className="add-new-button" onClick={openNewFood}>
              + {search.trim() && shown.length === 0 ? `Add "${search.trim()}" as a new food` : "Add a new food"}
            </button>
          )}
        </>
      )}

      {/* New food: create it and add it to the groceries in one step */}
      {showNew && (
        <form className="add-new" onSubmit={handleNewFood} noValidate>
          <h2 className="add-new-title">New food</h2>
          <p className="required-note add-required-note">
            <Req /> Required
          </p>

          <label htmlFor="new-name">
            Food name <Req />
          </label>
          <input
            id="new-name"
            required
            aria-required="true"
            aria-invalid={newErrors.name ? true : undefined}
            aria-describedby={newErrors.name ? "new-name-error" : undefined}
            placeholder="e.g. Peach"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          {newErrors.name && (
            <p id="new-name-error" className="add-field-error">
              {newErrors.name}
            </p>
          )}

          <label htmlFor="new-kind">
            Kind <span className="add-optional">(optional)</span>
          </label>
          <input
            id="new-kind"
            placeholder="e.g. Yellow, Organic"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value)}
          />

          <fieldset className="add-choices">
            <legend>
              Size of one <Req />
            </legend>
            {SIZES.map((s) => (
              <label key={s.id} className={newSize === s.id ? "add-choice is-picked" : "add-choice"}>
                <input
                  type="radio"
                  name="new-size"
                  value={s.id}
                  checked={newSize === s.id}
                  onChange={() => setNewSize(s.id)}
                />
                {s.label}
              </label>
            ))}
          </fieldset>

          <fieldset className="add-choices">
            <legend>
              Where will you keep it? <Req />
            </legend>
            {STORAGE.map((s) => (
              <label key={s.id} className={newStore === s.id ? "add-choice is-picked" : "add-choice"}>
                <input
                  type="radio"
                  name="new-store"
                  value={s.id}
                  checked={newStore === s.id}
                  onChange={() => pickStorage(s.id)}
                />
                {s.label}
              </label>
            ))}
          </fieldset>

          <label htmlFor="new-days">
            Stays fresh for about how many days? <Req />
          </label>
          <input
            id="new-days"
            type="number"
            min={1}
            max={3650}
            inputMode="numeric"
            required
            aria-required="true"
            aria-invalid={newErrors.days ? true : undefined}
            aria-describedby={newErrors.days ? "new-days-error" : undefined}
            value={newDays}
            onChange={(e) => setNewDays(e.target.value)}
          />
          {newErrors.days && (
            <p id="new-days-error" className="add-field-error">
              {newErrors.days}
            </p>
          )}

          <label htmlFor="new-qty">
            How many did you buy? <Req />
          </label>
          <input
            id="new-qty"
            type="number"
            min={1}
            max={999}
            inputMode="numeric"
            required
            aria-required="true"
            aria-invalid={newErrors.qty ? true : undefined}
            aria-describedby={newErrors.qty ? "new-qty-error" : undefined}
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
          />
          {newErrors.qty && (
            <p id="new-qty-error" className="add-field-error">
              {newErrors.qty}
            </p>
          )}

          {newErrors.form && (
            <p className="add-error" role="alert">
              {newErrors.form}
            </p>
          )}

          <div className="add-new-actions">
            <button type="button" className="is-secondary" onClick={() => setShowNew(false)}>
              Cancel
            </button>
            <button type="submit" disabled={newSaving}>
              {newSaving ? "Adding…" : "Add to my groceries"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

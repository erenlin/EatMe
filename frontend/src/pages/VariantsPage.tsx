// One dictionary item (/dictionary/:itemId): its variants (B1b) and a form to add one (B2b).
// Tap a variant to open its own page with what's in your fridge.
// The dictionary passes the item's name in router state; if you land here from
// the address bar, it looks the name up instead.
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ApiError } from "../services/client";
import {
  addVariant,
  checkServingRule,
  listVariants,
  type CountingMethod,
  type StoreMode,
  type Variant,
} from "../services/variants";
import { lookupItems } from "../services/items";
import "../styles/VariantsPage.css";

// Turns a status code from the backend into a sentence a user can understand.
function friendlyError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return "Can't reach the server. Make sure the backend is running.";
  }
  switch (err.status) {
    case 400:
      return `Something in the form isn't valid: ${err.message}`;
    case 401:
      return "Your login expired. Log out and log back in.";
    case 404:
      return "That item wasn't found in your pantry.";
    case 409:
      return "This item already has a variant with that name.";
    default:
      return err.message;
  }
}

export default function VariantsPage() {
  const itemId = Number(useParams().itemId);
  const passedName = (useLocation().state as { itemName?: string } | null)?.itemName ?? "";
  const [itemName, setItemName] = useState(passedName);

  // ---- The list (B1b) ----
  const [variants, setVariants] = useState<Variant[]>([]);
  const [query, setQuery] = useState("");
  const [listError, setListError] = useState("");

  // ---- The add form (B2b) ----
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [serving, setServing] = useState("");
  const [expiryDays, setExpiryDays] = useState("");
  const [method, setMethod] = useState<CountingMethod>("divisible");
  const [store, setStore] = useState<StoreMode>("room");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Asks the backnd for the variants and puts them on screen.
  function loadVariants(searchText: string) {
    listVariants(itemId, searchText)
      .then((rows) => {
        setVariants(rows);
        setListError("");
      })
      .catch((err: unknown) => setListError(friendlyError(err)));
  }

  // No name came with the click (e.g. a refresh): find it in the user's items.
  useEffect(() => {
    if (passedName) return;
    lookupItems("")
      .then((items) => {
        const found = (items ?? []).find((i) => i.item_id === itemId);
        if (found) setItemName(found.item_name);
      })
      .catch(() => {}); // the variants request below shows any error
  }, [itemId, passedName]);

  // Load the full list when the page opens, or when a different item is opened.
  useEffect(() => {
    listVariants(itemId, "")
      .then((rows) => {
        setVariants(rows);
        setListError("");
      })
      .catch((err: unknown) => setListError(friendlyError(err)));
  }, [itemId]);

  function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    loadVariants(query);
  }

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");

    if (!name.trim()) {
      setFormError("Give the variant a name, like Gala or Fuji.");
      return;
    }
    const weightNum = Number(weight);
    const servingNum = Number(serving);
    const ruleProblem = checkServingRule(method, weightNum, servingNum);
    if (ruleProblem) {
      setFormError(ruleProblem);
      return;
    }
    const expiryNum = Number(expiryDays);
    if (!Number.isInteger(expiryNum) || expiryNum < 1 || expiryNum > 3650) {
      setFormError("Enter how many days it lasts, from 1 to 3650.");
      return;
    }

    setSaving(true);
    try {
      await addVariant({
        item_id: itemId,
        variant_name: name.trim(),
        typical_weight_grams: weightNum,
        serving_grams: servingNum,
        default_expiry_days: expiryNum,
        counting_method: method,
        default_store_mode: store,
      });
      // Clear the form and reload the list so the new variant shows up.
      setName("");
      setWeight("");
      setServing("");
      setExpiryDays("");
      loadVariants(query);
    } catch (err) {
      setFormError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="variants">
      <Link to="/dictionary" className="variants-back">
        ← Dictionary
      </Link>
      <h1>{itemName || "Item"}</h1>
      <p className="variants-sub">Kinds of {itemName || "this item"} in your dictionary</p>

      {/* B1b: search and list */}
      <form className="variants-search" onSubmit={handleSearch}>
        <label htmlFor="variant-search" className="sr-only">
          Search variants
        </label>
        <input
          id="variant-search"
          type="search"
          placeholder="Search, e.g. gala"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>

      {listError && (
        <p className="variants-error" role="alert">
          {listError}
        </p>
      )}

      {variants.length === 0 && !listError ? (
        <p className="variants-empty">No variants yet. Add one below.</p>
      ) : (
        <ul className="variants-list">
          {variants.map((v) => (
            <li key={v.variant_id}>
              <Link
                className="variants-toggle"
                to={`/dictionary/${itemId}/variants/${v.variant_id}`}
                state={{ variant: v, itemName }}
              >
                <strong>{v.variant_name}</strong>
                <span>
                  {v.typical_weight_grams} g each · {v.serving_grams} g serving · {v.default_store_mode}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {variants.length === 100 && (
        <p className="variants-note">Showing the first 100. Try a more specific search.</p>
      )}

      {/* B2b: add a variant */}
      <details className="variants-add">
      <summary>+ Add a variant</summary>
      <form className="variants-form" onSubmit={handleAdd} noValidate>
        <label htmlFor="v-name">Name</label>
        <input id="v-name" value={name} onChange={(e) => setName(e.target.value)} />

        <label htmlFor="v-weight">Weight of one unit (grams)</label>
        <input
          id="v-weight"
          type="number"
          min={1}
          inputMode="numeric"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />

        <label htmlFor="v-serving">One serving (grams)</label>
        <input
          id="v-serving"
          type="number"
          min={1}
          inputMode="numeric"
          value={serving}
          onChange={(e) => setServing(e.target.value)}
        />

        <label htmlFor="v-method">How is it counted?</label>
        <select
          id="v-method"
          value={method}
          onChange={(e) => setMethod(e.target.value as CountingMethod)}
        >
          <option value="divisible">Divisible (you use part of one, like cheese)</option>
          <option value="numerable">Countable (you use whole ones, like eggs)</option>
        </select>

        <label htmlFor="v-store">Usually stored in</label>
        <select
          id="v-store"
          value={store}
          onChange={(e) => setStore(e.target.value as StoreMode)}
        >
          <option value="room">Room temperature</option>
          <option value="fridge">Fridge</option>
          <option value="freezer">Freezer</option>
        </select>

        <label htmlFor="v-expiry">How many days does it last there?</label>
        <input
          id="v-expiry"
          type="number"
          min={1}
          max={3650}
          inputMode="numeric"
          value={expiryDays}
          onChange={(e) => setExpiryDays(e.target.value)}
        />

        {formError && (
          <p className="variants-error" role="alert">
            {formError}
          </p>
        )}

        <button type="submit" disabled={saving}>
          {saving ? "Adding…" : "Add variant"}
        </button>
      </form>
      </details>
    </main>
  );
}
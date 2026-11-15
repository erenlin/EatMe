// My Groceries: everything the user has, soonest-expiring first, with freshness bars.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ApiError } from "../services/client";
import { consumeInstance, listAllInstances, type Grocery } from "../services/instances";
import { lookupItems } from "../services/items";
import { barTone, daysLeft, freshnessPercent } from "../utils/freshness";
import "../styles/InventoryPage.css";

// Turns any error into a sentence we can show on screen.
function messageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "Can't reach the server. Make sure the backend is running.";
  if (err.status === 401) return "Your login expired. Log out and log back in.";
  if (err.status === 404) return "That grocery wasn't found. Try refreshing the page.";
  return err.message;
}

// How many whole units are left: 2 apples, then 1 after "Use one".
function unitsLeft(g: Grocery): number {
  if (g.unit_weight_grams > 0) return Math.ceil(g.grams_remaining / g.unit_weight_grams);
  return g.quantity;
}

export default function InventoryPage() {
  // ---- Sticky notes (what the page remembers) ----
  const [groceries, setGroceries] = useState<Grocery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); // loading failed: shown instead of the list
  const [actionError, setActionError] = useState(""); // a button failed: shown above the list
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null); // card with a request in flight
  // The time the list loaded. Freshness is worked out from this, so nothing
  // reads the clock during render.
  const [loadedAt, setLoadedAt] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // ---- Debounced autocomplete: call item lookup as user types ----
  useEffect(() => {
    const q = search.trim();
    const id = window.setTimeout(() => {
      if (!q) { setSuggestions([]); return; }
      lookupItems(q)
        .then((items) => setSuggestions(items.map((i) => i.item_name)))
        .catch(() => setSuggestions([]));
    }, q ? 180 : 0);
    return () => window.clearTimeout(id);
  }, [search]);

  // Close dropdown when clicking outside the search area.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // ---- Load all groceries once, when the page opens ----
  useEffect(() => {
    listAllInstances()
      .then((rows) => {
        setGroceries(rows);
        setLoadedAt(Date.now());
      })
      .catch((err: unknown) => setError(messageFor(err)))
      .finally(() => setLoading(false));
  }, []);

  // ---- Use some grams of one grocery, then update its card ----
  async function spendGrams(g: Grocery, grams: number) {
    setActionError("");
    setBusyId(g.instance_id);
    try {
      const result = await consumeInstance(g.instance_id, grams);
      setGroceries((list) =>
        result.grams_remaining <= 0
          ? list.filter((x) => x.instance_id !== g.instance_id) // all gone: remove the card
          : list.map((x) =>
              x.instance_id === g.instance_id ? { ...x, grams_remaining: result.grams_remaining } : x,
            ),
      );
    } catch (err) {
      setActionError(messageFor(err));
    } finally {
      setBusyId(null);
    }
  }

  // "Use one": one serving, or whatever is left if that's less.
  function handleUseOne(g: Grocery) {
    const serving = g.serving_grams > 0 ? g.serving_grams : g.grams_remaining;
    spendGrams(g, Math.min(serving, g.grams_remaining));
  }

  // "Delete". WORKAROUND: there's no delete endpoint yet, so we use up every gram left.
  function handleDelete(g: Grocery) {
    if (!window.confirm(`Remove ${g.item_name} from your groceries?`)) return;
    spendGrams(g, g.grams_remaining);
  }

  // ---- Search: filter the list we already have (no backend call) ----
  const query = search.trim().toLowerCase();
  const shown = query
    ? groceries.filter(
        (g) =>
          g.item_name.toLowerCase().includes(query) ||
          g.variant_name.toLowerCase().includes(query),
      )
    : groceries;

  // ---- What you see ----
  return (
    <main className="inventory">
      <header className="inventory-header">
        <h1 className="inventory-title">My Groceries</h1>
        <Link className="inventory-add" to="/add">
          + Add
        </Link>
      </header>

      <div className="inventory-search-wrap" ref={searchWrapRef}>
        <label htmlFor="inventory-search" className="inventory-hidden">
          Search groceries
        </label>
        <input
          id="inventory-search"
          className="inventory-search"
          type="search"
          placeholder="Search groceries"
          value={search}
          autoComplete="off"
          onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
          onFocus={() => { if (search.trim()) setShowSuggestions(true); }}
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="inventory-suggestions" role="listbox" aria-label="Food suggestions">
            {suggestions.map((name) => (
              <li
                key={name}
                role="option"
                aria-selected={false}
                className="inventory-suggestion"
                onPointerDown={() => { setSearch(name); setShowSuggestions(false); }}
              >
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {actionError && (
        <p className="inventory-error" role="alert">
          {actionError}
        </p>
      )}

      {error ? (
        <p className="inventory-error" role="alert">
          {error}
        </p>
      ) : loading ? (
        <p className="inventory-muted">Loading…</p>
      ) : groceries.length === 0 ? (
        <div className="inventory-empty">
          <h2>Your fridge is empty!</h2>
          <p>Add your first grocery and we'll remind you before it goes bad.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="inventory-empty">
          <h2>No matches found!</h2>
          <p>Try searching for another grocery.</p>
        </div>
      ) : (
        <ul className="inventory-list">
          {shown.map((g) => (
            <GroceryCard
              key={g.instance_id}
              grocery={g}
              now={loadedAt}
              busy={busyId === g.instance_id}
              onUseOne={() => handleUseOne(g)}
              onDelete={() => handleDelete(g)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

// One card: "Apple 2x", days left, a freshness bar, and the two buttons.
type CardProps = {
  grocery: Grocery;
  now: number;
  busy: boolean;
  onUseOne: () => void;
  onDelete: () => void;
};

function GroceryCard({ grocery, now, busy, onUseOne, onDelete }: CardProps) {
  const { item_name, variant_name, added_at, expires_at } = grocery;

  let daysText = "no expiry set";
  let urgent = false;
  let percent: number | null = null;
  if (expires_at) {
    const days = daysLeft(expires_at, now);
    daysText = days <= 0 ? "expired" : `${days}d`;
    urgent = days <= 1;
    percent = freshnessPercent(added_at, expires_at, now);
  }

  return (
    <li className="inventory-card">
      {/* Tapping the name, days, or bar opens the details page. The grocery rides
          along in router state so that page can show it right away. */}
      <Link
        className="inventory-card-link"
        to={`/groceries/${grocery.instance_id}`}
        state={{ grocery }}
      >
      <div className="inventory-card-top">
        <div>
          <strong className="inventory-name">
            {item_name} {unitsLeft(grocery)}x
          </strong>
          <span className="inventory-variant">{variant_name}</span>
        </div>
        <span className={urgent ? "inventory-days is-urgent" : "inventory-days"}>{daysText}</span>
      </div>

      {percent !== null && (
        <div
          className="inventory-bar"
          role="progressbar"
          aria-label={`${item_name} freshness`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
        >
          <div
            className={`inventory-bar-fill${barTone(urgent, percent)}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      </Link>

      <div className="inventory-actions">
        <button type="button" onClick={onUseOne} disabled={busy}>
          {busy ? "…" : "Use one"}
        </button>
        <button type="button" className="is-secondary" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </div>
    </li>
  );
}

// Groceries: everything the user has, soonest-expiring first, with freshness bars,
// grouped by expiry (default), where it's kept, or food. Searching shows one flat list.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ApiError } from "../services/client";
import { consumeInstance, listAllInstances, type Grocery } from "../services/instances";
import { lookupItems } from "../services/items";
import ConfirmButton from "../components/ConfirmButton";
import UseSlider from "../components/UseSlider";
import { clampUseGrams, defaultUseGrams } from "../utils/useAmount";
import { barTone, daysLeft, freshnessPercent } from "../utils/freshness";
import {
  GROUP_BY_OPTIONS,
  groupByExpiry,
  groupByFood,
  groupByWhere,
  loadGroupBy,
  saveGroupBy,
  type GroupBy,
  type Section,
} from "../utils/groceryGroups";
import "../styles/InventoryPage.css";

function messageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "Can't reach the server. Make sure the backend is running.";
  if (err.status === 401) return "Your login expired. Log out and log back in.";
  if (err.status === 404) return "That grocery wasn't found. Try refreshing the page.";
  return err.message;
}

function unitsLeft(g: Grocery): number {
  if (g.unit_weight_grams > 0) return Math.ceil(g.grams_remaining / g.unit_weight_grams);
  return g.quantity;
}

// "3 days left" / "expired" / "no expiry set", whether it's urgent, and the bar's fill.
function freshness(g: Grocery, now: number) {
  if (!g.expires_at) return { daysText: "no expiry set", urgent: false, percent: null };
  const days = daysLeft(g.expires_at, now);
  return {
    daysText: days <= 0 ? "expired" : `${days} ${days === 1 ? "day" : "days"} left`,
    urgent: days <= 1,
    percent: freshnessPercent(g.added_at, g.expires_at, now),
  };
}

export default function InventoryPage() {
  const [groceries, setGroceries] = useState<Grocery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [groupBy, setGroupByState] = useState<GroupBy>(loadGroupBy);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  function setGroupBy(next: GroupBy) {
    setGroupByState(next);
    saveGroupBy(next);
  }

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

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    listAllInstances()
      .then((rows) => {
        setGroceries(rows);
        setLoadedAt(Date.now());
      })
      .catch((err: unknown) => setError(messageFor(err)))
      .finally(() => setLoading(false));
  }, []);

  async function spendGrams(g: Grocery, grams: number) {
    setActionError("");
    setBusyId(g.instance_id);
    try {
      const result = await consumeInstance(g.instance_id, grams);
      setGroceries((list) =>
        result.grams_remaining <= 0
          ? list.filter((x) => x.instance_id !== g.instance_id)
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

  const query = search.trim().toLowerCase();
  const shown = query
    ? groceries.filter(
        (g) =>
          g.item_name.toLowerCase().includes(query) ||
          g.variant_name.toLowerCase().includes(query),
      )
    : groceries;

  // Searching shows one flat list of matches; otherwise the chosen grouping.
  const searching = query !== "";
  const sections: Section<Grocery>[] = searching
    ? []
    : groupBy === "where"
      ? groupByWhere(groceries)
      : groupBy === "food"
        ? groupByFood(groceries)
        : groupByExpiry(groceries, loadedAt);

  const card = (g: Grocery) => (
    <GroceryCard
      key={g.instance_id}
      grocery={g}
      now={loadedAt}
      busy={busyId === g.instance_id}
      onUse={(grams) => spendGrams(g, grams)}
      onDelete={() => spendGrams(g, g.grams_remaining)}
    />
  );

  return (
    <main className="inventory">
      <header className="inventory-header">
        <h1 className="inventory-title">Groceries</h1>
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
      ) : searching ? (
        shown.length === 0 ? (
          <div className="inventory-empty">
            <h2>No matches found!</h2>
            <p>Try searching for another grocery.</p>
          </div>
        ) : (
          <ul className="inventory-list">{shown.map(card)}</ul>
        )
      ) : (
        <>
          <div className="inventory-groupby">
            <span id="groupby-label" className="inventory-groupby-label">
              Group by
            </span>
            <div className="inventory-segments" role="group" aria-labelledby="groupby-label">
              {GROUP_BY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="inventory-segment"
                  aria-pressed={groupBy === opt.id}
                  onClick={() => setGroupBy(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {sections.map((s) => (
            <section key={s.key} className="inventory-section" aria-labelledby={`sec-${s.key}`}>
              {groupBy === "food" ? (
                <FoodCard id={`sec-${s.key}`} section={s} now={loadedAt} />
              ) : (
                <>
                  <h2 id={`sec-${s.key}`} className="inventory-section-title">
                    {s.title} · {s.items.length}
                  </h2>
                  {s.items.length === 0 ? (
                    <p className="inventory-muted inventory-section-empty">{s.emptyText}</p>
                  ) : (
                    <ul className="inventory-list">{s.items.map(card)}</ul>
                  )}
                </>
              )}
            </section>
          ))}
        </>
      )}
    </main>
  );
}

// Food view: one card per food with a row for each of its groceries.
// Rows open the grocery's details page, which is where Use and Delete live.
function FoodCard({ id, section, now }: { id: string; section: Section<Grocery>; now: number }) {
  const total = section.items.reduce((sum, g) => sum + unitsLeft(g), 0);
  const types = new Set(section.items.map((g) => g.variant_name.toLowerCase())).size;
  return (
    <div className="inventory-food">
      <div className="inventory-food-top">
        <h2 id={id} className="inventory-food-name">
          {section.title}
        </h2>
        <span className="inventory-muted">
          {total} total{types > 1 ? ` · ${types} types` : ""}
        </span>
      </div>
      <ul className="inventory-food-rows">
        {section.items.map((g) => {
          const f = freshness(g, now);
          return (
            <li key={g.instance_id}>
              <Link
                className="inventory-food-row"
                to={`/groceries/${g.instance_id}`}
                state={{ grocery: g }}
              >
                <span>
                  {g.variant_name} ×{unitsLeft(g)}
                </span>
                <span className={f.urgent ? "inventory-days is-urgent" : "inventory-days"}>
                  {f.daysText} <span aria-hidden="true">›</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type CardProps = {
  grocery: Grocery;
  now: number;
  busy: boolean;
  onUse: (grams: number) => void;
  onDelete: () => void;
};

function GroceryCard({ grocery, now, busy, onUse, onDelete }: CardProps) {
  const { item_name, variant_name } = grocery;
  const [useGrams, setUseGrams] = useState(() => defaultUseGrams(grocery));
  // Clamp to available grams at render time — no effect needed.
  const effectiveGrams = clampUseGrams(useGrams, grocery);

  const { daysText, urgent, percent } = freshness(grocery, now);

  return (
    <li className="inventory-card">
      <Link
        className="inventory-card-link"
        to={`/groceries/${grocery.instance_id}`}
        state={{ grocery }}
      >
        <div className="inventory-card-top">
          <div>
            <strong className="inventory-name">
              {item_name} ×{unitsLeft(grocery)}
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

      <UseSlider
        grocery={grocery}
        itemName={item_name}
        grams={effectiveGrams}
        disabled={busy}
        onChange={setUseGrams}
      />

      <div className="inventory-actions">
        <button type="button" onClick={() => onUse(effectiveGrams)} disabled={busy}>
          {busy ? "…" : "Use"}
        </button>
        <ConfirmButton
          label="Delete"
          className="is-secondary"
          question={`Remove ${item_name} from your groceries?`}
          confirmLabel="Yes, remove"
          onConfirm={onDelete}
          disabled={busy}
        />
      </div>
    </li>
  );
}

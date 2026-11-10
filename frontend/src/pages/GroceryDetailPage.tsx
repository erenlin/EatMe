// Grocery details (/groceries/:id): everything about one grocery (one instance),
// plus ways to use some of it or remove it.
// My Groceries passes the grocery in router state so this opens instantly;
// if you land here straight from the address bar, it loads it instead.
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import FoodIcon from "../components/FoodIcon";
import { ApiError } from "../services/client";
import { consumeInstance, getGrocery, type Grocery } from "../services/instances";
import { barTone, daysLeft, freshnessPercent } from "../utils/freshness";
import "../styles/GroceryDetailPage.css";

// Turns any error into a sentence we can show on screen.
function messageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "Can't reach the server. Make sure the backend is running.";
  if (err.status === 401) return "Your login expired. Log out and log back in.";
  if (err.status === 404) return "That grocery wasn't found. It may be used up.";
  if (err.status === 409) return err.message || "That amount doesn't work. Try a smaller number.";
  return err.message;
}

// "2026-11-17T..." -> "Nov 17, 2026"
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// "about 2 servings (450 g)": what's left, in servings, with the grams after.
// Whole numbers drop the "about"; under one serving says so; no serving size
// set means grams only.
function leftText(g: Grocery): string {
  const grams = `${g.grams_remaining} g`;
  if (!(g.serving_grams > 0)) return grams;
  const servings = g.grams_remaining / g.serving_grams;
  if (servings < 1) return `less than 1 serving (${grams})`;
  const rounded = Math.round(servings);
  const word = rounded === 1 ? "serving" : "servings";
  const about = Number.isInteger(servings) ? "" : "about ";
  return `${about}${rounded} ${word} (${grams})`;
}

export default function GroceryDetailPage() {
  const instanceId = Number(useParams().id);
  const navigate = useNavigate();
  const location = useLocation();
  const passedIn = (location.state as { grocery?: Grocery } | null)?.grocery;
  // Opened from inside the app (My Groceries or a dictionary variant)? Then
  // "Back" returns there. Opened straight from the address bar: go to My Groceries.
  const cameFromApp = location.key !== "default";
  const fromState = passedIn?.instance_id === instanceId ? passedIn : null;

  // ---- Sticky notes (what the page remembers) ----
  const [grocery, setGrocery] = useState<Grocery | null>(fromState);
  const [loading, setLoading] = useState(!fromState);
  const [loadError, setLoadError] = useState("");
  const [grams, setGrams] = useState(fromState?.serving_grams ? String(fromState.serving_grams) : "");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  // The time the page opened. Freshness is worked out from this, so nothing
  // reads the clock during render.
  const [now] = useState(() => Date.now());

  // ---- Load the grocery if it didn't come with the click ----
  useEffect(() => {
    if (fromState) return;
    if (!Number.isInteger(instanceId) || instanceId <= 0) {
      Promise.resolve().then(() => {
        setLoadError("That grocery wasn't found.");
        setLoading(false);
      });
      return;
    }
    getGrocery(instanceId)
      .then((g) => {
        if (!g) {
          setLoadError("That grocery wasn't found. It may be used up.");
          return;
        }
        setGrocery(g);
        if (g.serving_grams > 0) setGrams(String(g.serving_grams));
      })
      .catch((err: unknown) => setLoadError(messageFor(err)))
      .finally(() => setLoading(false));
  }, [instanceId, fromState]);

  // ---- Use some grams; when it's all gone, go back to My Groceries ----
  async function spend(amount: number) {
    if (!grocery) return;
    setActionError("");
    setBusy(true);
    try {
      const result = await consumeInstance(grocery.instance_id, amount);
      if (result.grams_remaining <= 0) {
        // All gone: this page has nothing left to show, so go back.
        if (cameFromApp) navigate(-1);
        else navigate("/", { replace: true });
        return;
      }
      setGrocery({ ...grocery, grams_remaining: result.grams_remaining });
    } catch (err) {
      setActionError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  function handleUse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!grocery) return;
    const amount = Number(grams);
    if (!Number.isInteger(amount) || amount < 1) {
      setActionError("Enter how many grams you used (1 or more).");
      return;
    }
    if (amount > grocery.grams_remaining) {
      setActionError(`Only ${grocery.grams_remaining} g left.`);
      return;
    }
    spend(amount);
  }

  function handleUseOne() {
    if (!grocery) return;
    const serving = grocery.serving_grams > 0 ? grocery.serving_grams : grocery.grams_remaining;
    spend(Math.min(serving, grocery.grams_remaining));
  }

  // WORKAROUND: there's no delete endpoint yet, so we use up every gram left.
  function handleDelete() {
    if (!grocery) return;
    if (!window.confirm(`Throw away the rest of your ${grocery.item_name}?`)) return;
    spend(grocery.grams_remaining);
  }

  // ---- What you see ----
  return (
    <main className="grocery">
      <Link
        to="/"
        className="grocery-back"
        onClick={(e) => {
          if (!cameFromApp) return;
          e.preventDefault();
          navigate(-1);
        }}
      >
        ← Back
      </Link>

      {loading ? (
        <p className="grocery-muted">Loading…</p>
      ) : loadError || !grocery ? (
        <p className="grocery-error" role="alert">
          {loadError || "That grocery wasn't found."}
        </p>
      ) : (
        <GroceryInfo
          grocery={grocery}
          now={now}
          grams={grams}
          busy={busy}
          actionError={actionError}
          onGramsChange={setGrams}
          onUse={handleUse}
          onUseOne={handleUseOne}
          onDelete={handleDelete}
        />
      )}
    </main>
  );
}

type InfoProps = {
  grocery: Grocery;
  now: number;
  grams: string;
  busy: boolean;
  actionError: string;
  onGramsChange: (value: string) => void;
  onUse: (e: FormEvent<HTMLFormElement>) => void;
  onUseOne: () => void;
  onDelete: () => void;
};

function GroceryInfo({
  grocery,
  now,
  grams,
  busy,
  actionError,
  onGramsChange,
  onUse,
  onUseOne,
  onDelete,
}: InfoProps) {
  const g = grocery;

  let daysText = "No expiry set";
  let urgent = false;
  let percent: number | null = null;
  if (g.expires_at) {
    const days = daysLeft(g.expires_at, now);
    daysText = days <= 0 ? "Expired" : days === 1 ? "1 day left" : `${days} days left`;
    urgent = days <= 1;
    percent = freshnessPercent(g.added_at, g.expires_at, now);
  }

  return (
    <>
      <div className="grocery-icon">
        <FoodIcon name={g.item_name} />
      </div>
      <h1 className="grocery-title">{g.item_name}</h1>
      <p className="grocery-muted">{g.variant_name}</p>

      <p className={urgent ? "grocery-days is-urgent" : "grocery-days"}>{daysText}</p>
      {percent !== null && (
        <div
          className="grocery-bar"
          role="progressbar"
          aria-label={`${g.item_name} freshness`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
        >
          <div
            className={`grocery-bar-fill${barTone(urgent, percent)}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      <dl className="grocery-facts">
        <dt>Left</dt>
        <dd>{leftText(g)}</dd>
        <dt>One serving</dt>
        <dd>{g.serving_grams > 0 ? `${g.serving_grams} g` : "not set"}</dd>
        <dt>Stored in</dt>
        <dd className="grocery-capitalize">{g.store_mode}</dd>
        <dt>Added</dt>
        <dd>{formatDate(g.added_at)}</dd>
        <dt>Expires</dt>
        <dd>{g.expires_at ? formatDate(g.expires_at) : "no expiry set"}</dd>
      </dl>

      <h2 className="grocery-heading">Use some</h2>
      <form className="grocery-use" onSubmit={onUse} noValidate>
        <label htmlFor="grocery-grams" className="grocery-hidden">
          Grams used
        </label>
        <input
          id="grocery-grams"
          type="number"
          min={1}
          max={g.grams_remaining}
          inputMode="numeric"
          placeholder="grams"
          value={grams}
          onChange={(e) => onGramsChange(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? "…" : "Use amount"}
        </button>
      </form>

      {actionError && (
        <p className="grocery-error" role="alert">
          {actionError}
        </p>
      )}

      <div className="grocery-actions">
        <button type="button" onClick={onUseOne} disabled={busy}>
          Use one serving
        </button>
      </div>

      {/* Less important here, so it's small and sits on its own. */}
      <button type="button" className="grocery-throw" onClick={onDelete} disabled={busy}>
        Throw away
      </button>

      <Link className="grocery-link" to={`/dictionary/${g.item_id}/variants/${g.variant_id}`}>
        See all {g.item_name} – {g.variant_name} in the dictionary →
      </Link>
    </>
  );
}

// Shows what's in the fridge for one variant (C1a), lets you add more (C1b),
// and lets you use some up (C1c). Tap a row's info to edit it on its own page.
// Used inside VariantDetailPage:
//   <FridgeSection variantId={v.variant_id} servingGrams={v.serving_grams} />
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ApiError } from "../services/client";
import { addInstance, listInstances, consumeInstance, type Instance } from "../services/instances";
import "../styles/FridgeSection.css";

type Props = {
  variantId: number;
  servingGrams?: number;
};

// Turns a backend error into a sentence the user can understand.
function friendlyError(err: unknown): string {
  if (!(err instanceof ApiError)) return "Can't reach the server. Make sure the backend is running.";
  switch (err.status) {
    case 400:
      return "Please enter a number greater than 0.";
    case 401:
      return "Your login expired. Log out and log back in.";
    case 404:
      return "That wasn't found in your fridge.";
    case 409:
      return err.message || "That amount doesn't work. Try a smaller number.";
    default:
      return err.message;
  }
}

// "2026-11-17T..." -> "Nov 17"
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function FridgeSection({ variantId, servingGrams }: Props) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [adding, setAdding] = useState(false);

  // Asks the backend for this variant's instances and puts them on screen.
  function reload() {
    listInstances(variantId)
      .then((rows) => {
        setInstances(rows ?? []);
        setError("");
      })
      .catch((err: unknown) => setError(friendlyError(err)))
      .finally(() => setLoading(false));
  }

  // Load when the section opens, or when a different variant is picked.
  useEffect(() => {
    listInstances(variantId)
      .then((rows) => {
        setInstances(rows ?? []);
        setError("");
      })
      .catch((err: unknown) => setError(friendlyError(err)))
      .finally(() => setLoading(false));
  }, [variantId]);

  // C1b: "I bought N of these"
  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const amount = Number(quantity);
    if (!Number.isInteger(amount) || amount < 1) {
      setError("Enter how many you bought (1 or more).");
      return;
    }
    setAdding(true);
    try {
      await addInstance(variantId, amount);
      setQuantity("1");
      reload();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="fridge">
      <h3 className="fridge-title">In your fridge</h3>

      <form className="fridge-add" onSubmit={handleAdd}>
        <label htmlFor={`qty-${variantId}`}>How many did you buy?</label>
        <div className="fridge-row">
          <input
            id={`qty-${variantId}`}
            type="number"
            min={1}
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <button type="submit" disabled={adding}>
            {adding ? "Adding…" : "Add to fridge"}
          </button>
        </div>
      </form>

      {error && (
        <p className="fridge-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="fridge-muted">Loading…</p>
      ) : instances.length === 0 ? (
        <p className="fridge-muted">Nothing in your fridge yet.</p>
      ) : (
        <ul className="fridge-list">
          {instances.map((inst) => (
            <InstanceRow
              key={inst.instance_id}
              instance={inst}
              servingGrams={servingGrams}
              onUsed={reload}
              onError={setError}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// One row: "3 × fridge · 540 g left · expires Nov 17", plus a "Use" box.
// It's its own component so each row can remember its own grams.
type RowProps = {
  instance: Instance;
  servingGrams?: number;
  onUsed: () => void;
  onError: (message: string) => void;
};

function InstanceRow({ instance, servingGrams, onUsed, onError }: RowProps) {
  const [grams, setGrams] = useState(servingGrams ? String(servingGrams) : "");
  const [using, setUsing] = useState(false);

  // C1c: "I used this many grams"
  async function handleUse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onError("");
    const amount = Number(grams);
    if (!Number.isInteger(amount) || amount < 1) {
      onError("Enter how many grams you used (1 or more).");
      return;
    }
    if (amount > instance.grams_remaining) {
      onError(`Only ${instance.grams_remaining} g left.`);
      return;
    }
    setUsing(true);
    try {
      await consumeInstance(instance.instance_id, amount);
      onUsed();
    } catch (err) {
      onError(friendlyError(err));
    } finally {
      setUsing(false);
    }
  }

  return (
    <li className="fridge-item">
      <Link className="fridge-info" to={`/groceries/${instance.instance_id}`}>
        <strong>
          {instance.quantity} × {instance.store_mode}
        </strong>
        <span>
          {instance.grams_remaining} g left ·{" "}
          {instance.expires_at ? `expires ${formatDate(instance.expires_at)}` : "no expiry set"}
        </span>
      </Link>
      <form className="fridge-row" onSubmit={handleUse}>
        <label htmlFor={`use-${instance.instance_id}`} className="fridge-hidden">
          Grams used
        </label>
        <input
          id={`use-${instance.instance_id}`}
          type="number"
          min={1}
          max={instance.grams_remaining}
          inputMode="numeric"
          placeholder="grams"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
        />
        <button type="submit" disabled={using}>
          {using ? "…" : "Use"}
        </button>
      </form>
    </li>
  );
}

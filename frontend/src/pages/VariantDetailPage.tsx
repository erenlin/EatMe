// One variant (/dictionary/:itemId/variants/:variantId): its details, what's in
// your fridge (C1a), and adding more (C1b). Tap a fridge row to edit that
// grocery on its own page (/groceries/:id).
// The item page passes the variant in router state; if you land here from the
// address bar, it loads it instead.
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import FridgeSection from "../components/FridgeSection";
import { ApiError } from "../services/client";
import { lookupItems } from "../services/items";
import { listVariants, type Variant } from "../services/variants";
import "../styles/VariantsPage.css";

function messageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return "Can't reach the server. Make sure the backend is running.";
  if (err.status === 401) return "Your login expired. Log out and log back in.";
  if (err.status === 404) return "That variant wasn't found.";
  return err.message;
}

type PassedState = { variant?: Variant; itemName?: string } | null;

export default function VariantDetailPage() {
  const params = useParams();
  const itemId = Number(params.itemId);
  const variantId = Number(params.variantId);
  const passed = useLocation().state as PassedState;
  const fromState = passed?.variant?.variant_id === variantId ? passed.variant : null;

  // ---- Sticky notes (what the page remembers) ----
  const [variant, setVariant] = useState<Variant | null>(fromState);
  const [itemName, setItemName] = useState(passed?.itemName ?? "");
  const [loading, setLoading] = useState(!fromState);
  // Already have everything from the click? Then there's nothing to load.
  const haveAll = Boolean(fromState && passed?.itemName);
  const [error, setError] = useState("");

  // ---- Load the variant (and item name) if they didn't come with the click ----
  useEffect(() => {
    if (haveAll) return;
    if (!Number.isInteger(itemId) || !Number.isInteger(variantId)) {
      Promise.resolve().then(() => {
        setError("That variant wasn't found.");
        setLoading(false);
      });
      return;
    }
    Promise.all([listVariants(itemId, ""), lookupItems("")])
      .then(([variants, items]) => {
        const found = variants.find((v) => v.variant_id === variantId);
        if (!found) {
          setError("That variant wasn't found.");
          return;
        }
        setVariant(found);
        const item = (items ?? []).find((i) => i.item_id === itemId);
        if (item) setItemName(item.item_name);
      })
      .catch((err: unknown) => setError(messageFor(err)))
      .finally(() => setLoading(false));
  }, [itemId, variantId, haveAll]);

  return (
    <main className="variants">
      <Link to={`/dictionary/${itemId}`} state={{ itemName }} className="variants-back">
        ← {itemName || "Back"}
      </Link>

      {loading ? (
        <p className="variants-empty">Loading…</p>
      ) : error || !variant ? (
        <p className="variants-error" role="alert">
          {error || "That variant wasn't found."}
        </p>
      ) : (
        <>
          <h1>{variant.variant_name}</h1>
          <p className="variants-sub">{itemName}</p>

          <dl className="variants-facts">
            <dt>One unit</dt>
            <dd>{variant.typical_weight_grams} g</dd>
            <dt>One serving</dt>
            <dd>{variant.serving_grams} g</dd>
            <dt>Counted as</dt>
            <dd>{variant.counting_method === "numerable" ? "whole units" : "divisible"}</dd>
            <dt>Usually stored</dt>
            <dd>{variant.default_store_mode}</dd>
          </dl>

          <FridgeSection variantId={variant.variant_id} servingGrams={variant.serving_grams} />
        </>
      )}
    </main>
  );
}

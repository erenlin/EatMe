// "Cook this" on a recipe's page (E1 + E2).
//   1. E1 finds the groceries you have for each ingredient (yours and shared with you).
//   2. We plan to use the ones expiring soonest first, and show it in everyday amounts.
//   3. You can change an amount or skip an ingredient, then "Cook it" takes it all out at once (E2).
import { useState } from "react";
import { ApiError } from "../services/client";
import { cookRecipe, lookupInstances, type CookResult, type PantryInstance } from "../services/cook";
import type { Ingredient } from "../services/ingredients";
import { planDraws, toCookLines, expiryText, type IngredientPlan } from "../utils/cookPlan";
import { describeGrams, gramsPer, unitsFor, type AmountUnit } from "../utils/recipeAmounts";
import "../styles/CookPanel.css";

type Props = {
  recipeId: number;
  ingredients: Ingredient[];
  multiplier: number; // "Making 2×" on the recipe page
  onCooked: () => void; // reload the recipe so "Have enough / Missing" updates
};

// One ingredient in the cook plan.
type Row = {
  ing: Ingredient;
  use: boolean; // unchecked = skip this ingredient
  amount: string; // what the user typed, in `unit`
  unit: AmountUnit;
  instances: PantryInstance[]; // from E1, already sorted (own first, soonest expiry)
  choosing: boolean; // true = the user picks which groceries to use
  picks: Record<number, string>; // instance_id -> amount typed for that grocery, in `unit`
};

const UNIT_LABEL: Record<AmountUnit, string> = { count: "whole", servings: "servings", grams: "g" };

// Turns an error from cooking into a sentence the user can understand.
function cookError(err: unknown): string {
  if (!(err instanceof ApiError)) return "Can't reach the server. Make sure the backend is running.";
  if (err.status === 401) return "Your login expired. Log out and log back in.";
  if (err.status === 409)
    return "Some of these groceries ran out or expired since you opened this. Tap Refresh and try again.";
  if (err.status === 404) return "This recipe or one of its groceries wasn't found. Tap Refresh and try again.";
  if (err.status === 400) return "Check the amounts: each one needs to be more than 0.";
  return err.message;
}

// A friendly default amount: "2" whole apples rather than "2.0".
function amountIn(unit: AmountUnit, grams: number, ing: Ingredient): string {
  const n = grams / gramsPer(unit, ing);
  return String(unit === "grams" ? Math.round(n) : Math.round(n * 10) / 10);
}

// The first unit the amount fits exactly ("3 whole", "2 servings"); otherwise grams,
// so rounding to 1.7 servings doesn't quietly change 200 g into 204 g.
function bestUnit(grams: number, ing: Ingredient): AmountUnit {
  return (
    unitsFor(ing).find((u) => {
      const n = grams / gramsPer(u, ing);
      return u === "grams" || Math.abs(n * 10 - Math.round(n * 10)) < 1e-6;
    }) ?? "grams"
  );
}

function whereText(instance: PantryInstance): string {
  const place = instance.store_mode === "room" ? "pantry" : instance.store_mode;
  return instance.is_own ? `your ${place}` : `${instance.owner_name}'s ${place}`;
}

// "bought Nov 20" — tells two groceries of the same food apart.
function boughtText(instance: PantryInstance): string {
  return `bought ${new Date(instance.added_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

// Groceries that can still be cooked with.
const usable = (instances: PantryInstance[]) =>
  instances.filter((inst) => !inst.is_expired && inst.remaining_grams > 0);

export default function CookPanel({ recipeId, ingredients, multiplier, onCooked }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooking, setCooking] = useState(false);
  const [result, setResult] = useState<CookResult[] | null>(null);

  // ---- E1: find the groceries for every ingredient ----
  async function loadPlan() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const found = await Promise.all(
        ingredients.map((ing) => lookupInstances({ variantId: ing.variant_id, shared: true })),
      );
      setRows(
        ingredients.map((ing, i) => {
          const needed = ing.grams * multiplier;
          const unit = bestUnit(needed, ing);
          const have = planDraws(needed, found[i]).draws.length > 0;
          return {
            ing,
            use: have,
            unit,
            amount: amountIn(unit, needed, ing),
            instances: found[i],
            choosing: false,
            picks: {},
          };
        }),
      );
    } catch (err) {
      setError(cookError(err));
    } finally {
      setLoading(false);
    }
  }

  function openPanel() {
    setOpen(true);
    void loadPlan();
  }

  function update(index: number, change: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...change } : r)));
  }

  // The amount the user typed, in grams (0 if it isn't a valid number).
  const gramsFor = (r: Row) => {
    const n = Number(r.amount);
    return n > 0 ? Math.round(n * gramsPer(r.unit, r.ing)) : 0;
  };

  // Grams typed for one hand-picked grocery (0 if empty or not a number).
  const pickGrams = (r: Row, instanceId: number) => {
    const n = Number(r.picks[instanceId] ?? "");
    return n > 0 ? Math.round(n * gramsPer(r.unit, r.ing)) : 0;
  };

  // What each ingredient will take, recalculated on every change.
  const plans: IngredientPlan[] = rows.map((r) => {
    if (!r.use) return { draws: [], shortGrams: 0 };
    if (!r.choosing) return planDraws(gramsFor(r), r.instances);
    // Hand-picked: never more than a grocery has left.
    const draws = usable(r.instances)
      .map((instance) => ({ instance, grams: Math.min(pickGrams(r, instance.instance_id), instance.remaining_grams) }))
      .filter((d) => d.grams > 0);
    return { draws, shortGrams: 0 };
  });

  // Switch an ingredient to "choose which ones", starting from the automatic plan.
  function startChoosing(index: number) {
    const r = rows[index];
    const picks: Record<number, string> = {};
    for (const d of planDraws(gramsFor(r), r.instances).draws) {
      picks[d.instance.instance_id] = amountIn(r.unit, d.grams, r.ing);
    }
    update(index, { choosing: true, picks });
  }

  function setPick(index: number, instanceId: number, value: string) {
    setRows((rs) =>
      rs.map((r, i) => (i === index ? { ...r, picks: { ...r.picks, [instanceId]: value } } : r)),
    );
  }
  const lines = toCookLines(plans);

  // ---- E2: cook ----
  async function handleCook() {
    setError("");
    if (lines.length === 0) {
      setError("Pick at least one ingredient you have to cook with.");
      return;
    }
    setCooking(true);
    try {
      setResult(await cookRecipe(recipeId, lines));
      onCooked();
    } catch (err) {
      setError(cookError(err));
    } finally {
      setCooking(false);
    }
  }

  function close() {
    setOpen(false);
    setResult(null);
    setError("");
  }

  // ---- What you see ----
  if (!open) {
    return (
      <button type="button" className="cook-start" onClick={openPanel}>
        Cook this
      </button>
    );
  }

  return (
    <section className="cook" aria-labelledby="cook-title">
      <h2 id="cook-title" className="cook-title">
        {result ? "Cooked!" : "Cook this recipe"}
      </h2>

      {result ? (
        <>
          <p className="cook-muted">Here's what was taken out of your groceries:</p>
          <ul className="cook-done">
            {result.map((r) => (
              <li key={r.consumption_id}>
                <strong>
                  {r.item_name} · {r.variant_name}
                </strong>
                <span>
                  used {r.grams_consumed} g · {r.remaining_grams > 0 ? `${r.remaining_grams} g left` : "all used up"}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="cook-primary" onClick={close}>
            Done
          </button>
        </>
      ) : loading ? (
        <p className="cook-muted">Checking your groceries…</p>
      ) : (
        <>
          <p className="cook-muted">
            We'll use the groceries that expire soonest first. Change an amount or uncheck anything you
            won't use.
          </p>

          <ul className="cook-list">
            {rows.map((r, i) => {
              const plan = plans[i];
              const none = r.instances.every((inst) => inst.is_expired || inst.remaining_grams <= 0);
              return (
                <li key={r.ing.ingredient_id} className={r.use ? "cook-row" : "cook-row is-skipped"}>
                  <label className="cook-check">
                    <input
                      type="checkbox"
                      checked={r.use}
                      disabled={none}
                      onChange={(e) => update(i, { use: e.target.checked })}
                    />
                    <strong>
                      {r.ing.item_name} · {r.ing.variant_name}
                    </strong>
                  </label>

                  {none ? (
                    <p className="cook-note is-missing">You don't have any. It'll be skipped.</p>
                  ) : (
                    <>
                      {!r.choosing && (
                      <div className="cook-amount">
                        <label htmlFor={`cook-amt-${r.ing.ingredient_id}`}>Use</label>
                        <input
                          id={`cook-amt-${r.ing.ingredient_id}`}
                          type="number"
                          min={0}
                          step={r.unit === "grams" ? 1 : 0.5}
                          inputMode="decimal"
                          disabled={!r.use}
                          value={r.amount}
                          onChange={(e) => update(i, { amount: e.target.value })}
                        />
                        {unitsFor(r.ing).length > 1 ? (
                          <select
                            aria-label={`Unit for ${r.ing.variant_name}`}
                            value={r.unit}
                            disabled={!r.use}
                            onChange={(e) => {
                              const unit = e.target.value as AmountUnit;
                              update(i, { unit, amount: amountIn(unit, gramsFor(r), r.ing) });
                            }}
                          >
                            {unitsFor(r.ing).map((u) => (
                              <option key={u} value={u}>
                                {UNIT_LABEL[u]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>g</span>
                        )}
                      </div>
                      )}

                      {r.use && !r.choosing && plan.draws.length > 0 && (
                        <ul className="cook-draws">
                          {plan.draws.map((d) => (
                            <li key={d.instance.instance_id}>
                              {describeGrams(d.grams, r.ing)} from {whereText(d.instance)} ·{" "}
                              {boughtText(d.instance)} · {expiryText(d.instance)}
                            </li>
                          ))}
                        </ul>
                      )}
                      {r.use && !r.choosing && plan.shortGrams > 0 && (
                        <p className="cook-note is-short">
                          You're short {describeGrams(plan.shortGrams, r.ing)}. We'll use what you have.
                        </p>
                      )}

                      {/* Choose which groceries to use (E1 shows every one you have) */}
                      {r.use && !r.choosing && (
                        <button type="button" className="cook-link" onClick={() => startChoosing(i)}>
                          Choose which ones
                        </button>
                      )}
                      {r.use && r.choosing && (
                        <fieldset className="cook-picks">
                          <legend>Your {r.ing.variant_name} groceries</legend>
                          {usable(r.instances).map((inst) => {
                            const typed = r.picks[inst.instance_id] ?? "";
                            const picked = Number(typed) > 0;
                            const over = pickGrams(r, inst.instance_id) > inst.remaining_grams;
                            const inputId = `cook-pick-${inst.instance_id}`;
                            return (
                              <div key={inst.instance_id} className={picked ? "cook-pick is-picked" : "cook-pick"}>
                                <label className="cook-pick-name">
                                  <input
                                    type="checkbox"
                                    checked={picked}
                                    onChange={(e) =>
                                      setPick(
                                        i,
                                        inst.instance_id,
                                        e.target.checked
                                          ? amountIn(r.unit, Math.min(gramsFor(r) || inst.remaining_grams, inst.remaining_grams), r.ing)
                                          : "",
                                      )
                                    }
                                  />
                                  <span>
                                    <strong>
                                      {boughtText(inst)}, {whereText(inst)}
                                    </strong>
                                    <small>
                                      {describeGrams(inst.remaining_grams, r.ing)} left · {expiryText(inst)}
                                    </small>
                                  </span>
                                </label>
                                {picked && (
                                  <span className="cook-pick-amount">
                                    <label htmlFor={inputId}>Use</label>
                                    <input
                                      id={inputId}
                                      type="number"
                                      min={0}
                                      step={r.unit === "grams" ? 1 : 0.5}
                                      inputMode="decimal"
                                      value={typed}
                                      onChange={(e) => setPick(i, inst.instance_id, e.target.value)}
                                    />
                                    <span>{UNIT_LABEL[r.unit]}</span>
                                  </span>
                                )}
                                {over && (
                                  <p className="cook-note is-short">
                                    Only {describeGrams(inst.remaining_grams, r.ing)} left, so we'll use all of it.
                                  </p>
                                )}
                              </div>
                            );
                          })}
                          <button type="button" className="cook-link" onClick={() => update(i, { choosing: false })}>
                            Let the app pick (soonest to expire first)
                          </button>
                        </fieldset>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          {error && (
            <p className="cook-error" role="alert">
              {error}
            </p>
          )}

          <div className="cook-actions">
            <button type="button" className="cook-secondary" onClick={close}>
              Cancel
            </button>
            {error && (
              <button type="button" className="cook-secondary" onClick={() => void loadPlan()}>
                Refresh
              </button>
            )}
            <button
              type="button"
              className="cook-primary"
              disabled={cooking || lines.length === 0}
              onClick={() => void handleCook()}
            >
              {cooking ? "Cooking…" : "Cook it"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

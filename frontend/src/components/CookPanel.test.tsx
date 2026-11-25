import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CookPanel from "./CookPanel";
import { cookRecipe, lookupInstances, type PantryInstance } from "../services/cook";
import { ApiError } from "../services/client";
import type { Ingredient } from "../services/ingredients";

vi.mock("../services/cook", () => ({
  lookupInstances: vi.fn(),
  cookRecipe: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());

// Apple pie needs 2 Gala apples (360 g) and 100 g of butter.
const apples: Ingredient = {
  ingredient_id: 1,
  recipe_id: 3,
  variant_id: 10,
  item_name: "Apple",
  variant_name: "Gala",
  grams: 360,
  ingredient_position: 1,
  counting_method: "numerable",
  typical_weight_grams: 180,
  serving_grams: 180,
};
const butter: Ingredient = {
  ...apples,
  ingredient_id: 2,
  variant_id: 20,
  item_name: "Butter",
  variant_name: "Salted",
  grams: 100,
  counting_method: "divisible",
  typical_weight_grams: 250,
  serving_grams: 10,
};

function grocery(id: number, variantId: number, remaining: number, extra: Partial<PantryInstance> = {}) {
  return {
    instance_id: id,
    variant_id: variantId,
    owner_user_id: 1,
    owner_name: "Me",
    is_own: true,
    item_name: "",
    variant_name: "",
    store_mode: "fridge",
    quantity: 1,
    unit_weight_grams: remaining,
    total_grams: remaining,
    used_grams: 0,
    remaining_grams: remaining,
    added_at: "2026-11-20T00:00:00Z",
    expires_at: null,
    is_expired: false,
    ...extra,
  } as PantryInstance;
}

describe("CookPanel", () => {
  test("plans from the groceries you have and cooks them in one request", async () => {
    vi.mocked(lookupInstances).mockImplementation(async ({ variantId } = {}) =>
      variantId === 10 ? [grocery(5, 10, 180), grocery(6, 10, 180)] : [grocery(8, 20, 250)],
    );
    vi.mocked(cookRecipe).mockResolvedValue([
      { consumption_id: 1, instance_id: 5, variant_id: 10, owner_user_id: 1, item_name: "Apple", variant_name: "Gala", grams_consumed: 180, remaining_grams: 0, consumed_at: "" },
    ]);
    const onCooked = vi.fn();

    render(<CookPanel recipeId={3} ingredients={[apples, butter]} multiplier={1} onCooked={onCooked} />);
    await userEvent.click(screen.getByRole("button", { name: "Cook this" }));

    // Apples are counted: the default is 2 whole.
    expect(await screen.findByLabelText("Use", { selector: "#cook-amt-1" })).toHaveProperty("value", "2");
    expect(lookupInstances).toHaveBeenCalledWith({ variantId: 10, shared: true });

    await userEvent.click(screen.getByRole("button", { name: "Cook it" }));

    expect(cookRecipe).toHaveBeenCalledExactlyOnceWith(3, [
      { instance_id: 5, grams: 180 },
      { instance_id: 6, grams: 180 },
      { instance_id: 8, grams: 100 },
    ]);
    expect(await screen.findByText("Cooked!")).toBeTruthy();
    expect(onCooked).toHaveBeenCalledOnce();
  });

  test("leaves out an ingredient you uncheck", async () => {
    vi.mocked(lookupInstances).mockImplementation(async ({ variantId } = {}) =>
      variantId === 10 ? [grocery(5, 10, 360)] : [grocery(8, 20, 250)],
    );
    vi.mocked(cookRecipe).mockResolvedValue([]);

    render(<CookPanel recipeId={3} ingredients={[apples, butter]} multiplier={1} onCooked={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Cook this" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Butter · Salted" }));
    await userEvent.click(screen.getByRole("button", { name: "Cook it" }));

    expect(cookRecipe).toHaveBeenCalledExactlyOnceWith(3, [{ instance_id: 5, grams: 360 }]);
  });

  test("skips foods you don't have and says how much you're short", async () => {
    vi.mocked(lookupInstances).mockImplementation(async ({ variantId } = {}) =>
      variantId === 10 ? [grocery(5, 10, 180)] : [],
    );

    render(<CookPanel recipeId={3} ingredients={[apples, butter]} multiplier={1} onCooked={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Cook this" }));

    expect(await screen.findByText("You don't have any. It'll be skipped.")).toBeTruthy();
    expect(screen.getByText(/You're short 1 whole \(180 g\)/)).toBeTruthy();
  });

  test("lets the user choose which groceries to use", async () => {
    vi.mocked(lookupInstances).mockResolvedValue([
      grocery(5, 10, 360, { added_at: "2026-11-20T12:00:00Z" }),
      grocery(6, 10, 360, { added_at: "2026-11-21T12:00:00Z" }),
    ]);
    vi.mocked(cookRecipe).mockResolvedValue([]);

    render(<CookPanel recipeId={3} ingredients={[apples]} multiplier={1} onCooked={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Cook this" }));

    // The app picks the first one (soonest to expire); the user switches to the other.
    await userEvent.click(await screen.findByRole("button", { name: "Choose which ones" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /bought Nov 20/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /bought Nov 21/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cook it" }));

    expect(cookRecipe).toHaveBeenCalledExactlyOnceWith(3, [{ instance_id: 6, grams: 360 }]);
  });

  test("explains when groceries ran out before cooking", async () => {
    vi.mocked(lookupInstances).mockResolvedValue([grocery(5, 10, 360)]);
    vi.mocked(cookRecipe).mockRejectedValue(new ApiError(409, "insufficient or expired inventory"));

    render(<CookPanel recipeId={3} ingredients={[apples]} multiplier={1} onCooked={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Cook this" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cook it" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/ran out or expired/);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });

  test("keeps exact grams when the amount isn't a round number of servings", async () => {
    // 200 g of flour is 1.67 servings; showing "1.7 servings" would cook 204 g.
    const flour: Ingredient = { ...butter, ingredient_id: 3, variant_id: 30, grams: 200, serving_grams: 120 };
    vi.mocked(lookupInstances).mockResolvedValue([grocery(9, 30, 1000)]);
    vi.mocked(cookRecipe).mockResolvedValue([]);

    render(<CookPanel recipeId={3} ingredients={[flour]} multiplier={1} onCooked={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Cook this" }));

    expect(await screen.findByLabelText("Use", { selector: "#cook-amt-3" })).toHaveProperty("value", "200");
    await userEvent.click(screen.getByRole("button", { name: "Cook it" }));
    expect(cookRecipe).toHaveBeenCalledExactlyOnceWith(3, [{ instance_id: 9, grams: 200 }]);
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ShoppingListPage from "./ShoppingListPage";
import { getShoppingList, resolveRestock, type ShoppingItem } from "../services/restock";

vi.mock("../services/restock", () => ({
  getShoppingList: vi.fn(),
  resolveRestock: vi.fn(),
}));

const eggs: ShoppingItem = {
  variant_id: 1,
  item_name: "Eggs",
  variant_name: "Large",
  typical_weight_grams: 50,
  counting_method: "numerable",
  icon_png: null,
  grams_needed: 200,
  grams_on_hand: 50,
  grams_to_buy: 150,
  units_to_buy: 3,
  recipes: [{ recipe_id: 7, recipe_name: "Pancakes", multiplier: 2, grams: 200 }],
  oldest_created_at: null,
};

const flour: ShoppingItem = {
  ...eggs,
  variant_id: 2,
  item_name: "Flour",
  variant_name: "All purpose",
  typical_weight_grams: 1000,
  counting_method: "divisible",
  grams_needed: 250,
  grams_on_hand: 0,
  grams_to_buy: 250,
  units_to_buy: 1,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ShoppingListPage />
    </MemoryRouter>,
  );
}

// A bit longer than the page waits before really checking something off.
const UNDO_MS = 5100;

// Let the page's pending promises settle.
const settle = () => act(async () => {});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

describe("shopping list", () => {
  test("shows what to buy, counted or weighed, and which recipes want it", async () => {
    vi.mocked(getShoppingList).mockResolvedValue([eggs, flour]);
    renderPage();
    await settle();

    expect(screen.getByText("3 to buy")).toBeTruthy();
    expect(screen.getByText("You have 1")).toBeTruthy();
    expect(screen.getByText("250 g to buy")).toBeTruthy();
    expect(screen.getAllByText("For Pancakes (2×)")).toHaveLength(2);
    expect(getShoppingList).toHaveBeenCalledWith(false);
  });

  test("shows the empty state when nothing is on the list", async () => {
    vi.mocked(getShoppingList).mockResolvedValue([]);
    renderPage();
    await settle();
    expect(screen.getByText("Your shopping list is empty.")).toBeTruthy();
  });

  test("checking off waits so it can be undone", async () => {
    vi.mocked(getShoppingList).mockResolvedValue([eggs, flour]);
    renderPage();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Got Eggs Large" }));
    expect(screen.queryByText("3 to buy")).toBeNull();
    expect(screen.getByText("Checked off Eggs")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("3 to buy")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(UNDO_MS);
    });
    expect(resolveRestock).not.toHaveBeenCalled();
  });

  test("checking off clears the food after the undo window", async () => {
    vi.mocked(getShoppingList).mockResolvedValue([eggs, flour]);
    vi.mocked(resolveRestock).mockResolvedValue(1);
    renderPage();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Got Eggs Large" }));
    await act(async () => {
      vi.advanceTimersByTime(UNDO_MS);
    });

    expect(resolveRestock).toHaveBeenCalledWith({ variant_id: 1 });
    expect(screen.queryByText("Checked off Eggs")).toBeNull();
    expect(screen.queryByText("3 to buy")).toBeNull();
  });

  test("a failed check-off brings the food back with an error", async () => {
    vi.mocked(getShoppingList).mockResolvedValue([eggs]);
    vi.mocked(resolveRestock).mockRejectedValue(new Error("boom"));
    renderPage();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Got Eggs Large" }));
    await act(async () => {
      vi.advanceTimersByTime(UNDO_MS);
    });

    expect(screen.getByRole("alert").textContent).toMatch("Couldn't check off Eggs");
    expect(screen.getByText("3 to buy")).toBeTruthy();
  });

  test("removing a recipe clears everything it wanted", async () => {
    vi.mocked(getShoppingList).mockResolvedValueOnce([eggs, flour]).mockResolvedValueOnce([]);
    vi.mocked(resolveRestock).mockResolvedValue(2);
    renderPage();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    await settle();

    expect(resolveRestock).toHaveBeenCalledWith({ recipe_id: 7 });
    expect(screen.getByText("Your shopping list is empty.")).toBeTruthy();
  });
});

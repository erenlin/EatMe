import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import ConfirmButton from "./ConfirmButton";
import FoodPicker from "./FoodPicker";
import { matchFoods } from "../utils/foodSearch";
import type { Food } from "../services/foods";
import { clampUseGrams, defaultUseGrams, sliderRange } from "../utils/useAmount";

describe("use amount", () => {
  const oranges = { grams_remaining: 520, unit_weight_grams: 130, serving_grams: 130 };

  test("whole-unit foods snap to whole units", () => {
    expect(sliderRange(oranges)).toEqual({ min: 130, max: 520, step: 130 });
  });

  test("less than one unit left falls back to 1 g steps", () => {
    const halfApple = { grams_remaining: 90, unit_weight_grams: 180, serving_grams: 180 };
    expect(sliderRange(halfApple)).toEqual({ min: 1, max: 90, step: 1 });
    expect(clampUseGrams(defaultUseGrams(halfApple), halfApple)).toBe(90); // never more than is left
  });

  test("starts at one serving and stays inside the range", () => {
    expect(defaultUseGrams(oranges)).toBe(130);
    expect(clampUseGrams(9999, oranges)).toBe(520);
    expect(clampUseGrams(0, oranges)).toBe(130);
  });
});

describe("ConfirmButton", () => {
  test("asks before running, and Cancel backs out", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton label="Delete" question="Remove Apple?" confirmLabel="Yes, remove" onConfirm={onConfirm} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Remove Apple?")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete" }));

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.keyboard("{Escape}");
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

const food = (variant_id: number, item_name: string, variant_name: string) =>
  ({ variant_id, item_name, variant_name }) as Food;
const FOODS = [food(1, "Apple", "Gala"), food(2, "Apple", "Fuji"), food(3, "Pineapple", "Gold")];

describe("FoodPicker", () => {
  test("matches every typed word, starts-with first", () => {
    expect(matchFoods(FOODS, "fuji").map((f) => f.variant_id)).toEqual([2]);
    expect(matchFoods(FOODS, "apple gala").map((f) => f.variant_id)).toEqual([1]);
    expect(matchFoods(FOODS, "pine").map((f) => f.variant_id)).toEqual([3]);
    expect(matchFoods(FOODS, "apple").map((f) => f.variant_id)).toEqual([1, 2, 3]);
  });

  function Harness({ onSelect }: { onSelect: (id: number | null) => void }) {
    const [id, setId] = useState<number | null>(null);
    return (
      <FoodPicker
        id="pick"
        foods={FOODS}
        selectedId={id}
        onSelect={(v) => {
          setId(v);
          onSelect(v);
        }}
      />
    );
  }

  test("type, arrow down, Enter picks a food; typing again clears it", async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const box = screen.getByRole("combobox");

    await userEvent.type(box, "apple");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith(2);
    expect((box as HTMLInputElement).value).toBe("Apple · Fuji");

    await userEvent.type(box, "x");
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  test("clicking an option picks it", async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await userEvent.type(screen.getByRole("combobox"), "pine");
    await userEvent.click(screen.getByRole("option", { name: "Pineapple · Gold" }));
    expect(onSelect).toHaveBeenLastCalledWith(3);
  });
});

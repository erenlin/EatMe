// Searchable food picker (a combobox): type to filter "Apple – Gala" style names,
// pick with the mouse or with ↑/↓ and Enter. Replaces a long plain <select>.
// Typing after a pick clears the pick, so what's shown is always what's chosen.
import { useId, useRef, useState } from "react";
import type { Food } from "../services/foods";
import { foodLabel, matchFoods } from "../utils/foodSearch";
import "../styles/FoodPicker.css";

const MAX_SHOWN = 8;

type Props = {
  id: string; // so a <label htmlFor> can point at the input
  foods: Food[];
  selectedId: number | null;
  onSelect: (variantId: number | null) => void;
  required?: boolean;
};

export default function FoodPicker({ id, foods, selectedId, onSelect, required }: Props) {
  const listId = useId();
  const selected = foods.find((f) => f.variant_id === selectedId) ?? null;
  const [query, setQuery] = useState(selected ? foodLabel(selected) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // While a food is picked, the box shows its name; the list is filtered by what's typed.
  const typed = selected && query === foodLabel(selected) ? "" : query;
  const matches = matchFoods(foods, typed);
  const shown = matches.slice(0, MAX_SHOWN);
  const activeIndex = Math.min(active, Math.max(0, shown.length - 1));
  const listOpen = open && shown.length > 0;

  function pick(f: Food) {
    onSelect(f.variant_id);
    setQuery(foodLabel(f));
    setOpen(false);
  }

  return (
    <div
      className="food-picker"
      ref={wrapRef}
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        placeholder="Search your foods…"
        required={required}
        aria-required={required}
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listId}
        aria-activedescendant={listOpen ? `${listId}-${activeIndex}` : undefined}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
          if (selectedId !== null) onSelect(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive(Math.min(activeIndex + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(Math.max(activeIndex - 1, 0));
          } else if (e.key === "Enter" && listOpen) {
            e.preventDefault(); // pick, don't submit the form
            pick(shown[activeIndex]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {listOpen && (
        <ul className="food-picker-list" id={listId} role="listbox">
          {shown.map((f, i) => (
            <li
              key={f.variant_id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={i === activeIndex ? "food-picker-option is-active" : "food-picker-option"}
              onPointerDown={(e) => e.preventDefault()} // keep focus in the input
              onClick={() => pick(f)}
              onPointerEnter={() => setActive(i)}
            >
              {foodLabel(f)}
            </li>
          ))}
          {matches.length > shown.length && (
            <li className="food-picker-more" aria-hidden="true">
              {matches.length - shown.length} more — keep typing to narrow it down
            </li>
          )}
        </ul>
      )}

      {open && typed && matches.length === 0 && (
        <p className="food-picker-none" role="status">
          No foods match “{typed}”.
        </p>
      )}
    </div>
  );
}

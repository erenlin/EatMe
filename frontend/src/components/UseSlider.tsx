// The "how much did you use" slider, shared by My Groceries cards and grocery details.
// It's controlled: the page keeps the grams and passes them in, already clamped.
import { sliderRange, useAmountLabel, type Usable } from "../utils/useAmount";
import "../styles/UseSlider.css";

type Props = {
  grocery: Usable;
  itemName: string; // for the screen-reader label, e.g. "Apple"
  grams: number;
  disabled?: boolean;
  onChange: (grams: number) => void;
};

export default function UseSlider({ grocery, itemName, grams, disabled, onChange }: Props) {
  const { min, max, step } = sliderRange(grocery);
  const extra = useAmountLabel(grams, grocery);
  return (
    <div className="use-slider">
      <input
        type="range"
        className="use-slider-input"
        min={min}
        max={max}
        step={step}
        value={grams}
        disabled={disabled}
        aria-label={`Grams to use from ${itemName}`}
        aria-valuetext={extra ? `${grams} grams, ${extra.replace("≈", "about ")}` : `${grams} grams`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="use-slider-label" aria-hidden="true">
        {grams}g{extra ? ` ${extra}` : ""}
      </span>
    </div>
  );
}

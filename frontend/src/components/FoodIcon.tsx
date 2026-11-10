// A food icon picked from the item's name: "Apple" -> apple, "Whole milk" -> milk.
// Anything we don't recognize gets a shopping basket.
//   <FoodIcon name={grocery.item_name} />
import { createElement } from "react";
import {
  Apple,
  Banana,
  Bean,
  Beef,
  CakeSlice,
  Candy,
  Carrot,
  Cheese,
  Cherry,
  Citrus,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Donut,
  Drumstick,
  Egg,
  Fish,
  Grape,
  Ham,
  IceCreamCone,
  LeafyGreen,
  Milk,
  Nut,
  Pizza,
  Salad,
  Sandwich,
  ShoppingBasket,
  Shrimp,
  Soup,
  Wheat,
  Wine,
  type LucideIcon,
} from "lucide-react";

// Checked top to bottom; the first keyword found in the name wins.
// Put longer, more specific words first ("pineapple" before "apple").
const ICONS: [string[], LucideIcon][] = [
  [["pineapple", "lemon", "lime", "orange", "grapefruit", "mandarin", "clementine"], Citrus],
  [["apple"], Apple],
  [["banana"], Banana],
  [["cherry", "cherries", "strawberr", "berry", "berries", "melon", "peach", "plum"], Cherry],
  [["grape"], Grape],
  [["carrot"], Carrot],
  [["lettuce", "spinach", "kale", "cabbage", "broccoli", "greens", "celery"], LeafyGreen],
  [["eggplant", "salad", "cucumber", "tomato", "pepper", "avocado", "onion"], Salad],
  [["ice cream", "gelato"], IceCreamCone],
  [["milk", "cream", "yogurt", "yoghurt", "butter"], Milk],
  [["egg"], Egg],
  [["cheese"], Cheese],
  [["bread", "bagel", "toast", "bun", "tortilla"], Sandwich],
  [["croissant", "pastry", "muffin"], Croissant],
  [["cake"], CakeSlice],
  [["cookie", "biscuit", "cracker"], Cookie],
  [["candy", "chocolate"], Candy],
  [["pizza"], Pizza],
  [["chicken", "turkey", "drumstick", "wing"], Drumstick],
  [["beef", "steak", "pork", "lamb", "meat", "burger", "sausage"], Beef],
  [["ham", "bacon"], Ham],
  [["shrimp", "prawn", "crab", "lobster"], Shrimp],
  [["fish", "salmon", "tuna", "cod", "tilapia"], Fish],
  [["rice", "flour", "pasta", "noodle", "oat", "cereal", "grain", "wheat"], Wheat],
  [["bean", "lentil", "chickpea", "tofu"], Bean],
  [["donut", "doughnut"], Donut],
  [["nut", "almond", "peanut", "cashew", "walnut", "pecan"], Nut],
  [["soup", "broth", "stock"], Soup],
  [["coffee", "tea"], Coffee],
  [["juice", "soda", "water", "drink"], CupSoda],
  [["wine", "beer"], Wine],
];

function iconFor(name: string): LucideIcon {
  const lower = name.toLowerCase();
  const match = ICONS.find(([words]) => words.some((w) => lower.includes(w)));
  return match ? match[1] : ShoppingBasket;
}

type Props = {
  name: string;
  size?: number;
  className?: string;
};

export default function FoodIcon({ name, size = 40, className }: Props) {
  // createElement (not <Icon />) because the icon is picked while rendering;
  // lucide's icons are fixed components, so this never remounts anything.
  // Decorative: the item's name is right next to it, so screen readers skip it.
  return createElement(iconFor(name), {
    size,
    strokeWidth: 1.6,
    className,
    "aria-hidden": true,
  });
}

import type { ItemCategory } from "@/lib/database.types";
import { formatCategory } from "@/lib/item-labels";

const GRADIENTS: Record<ItemCategory, string> = {
  books: "from-amber-950/50 via-amber-900/30 to-stone-900/40",
  movies_and_tv: "from-violet-950/50 via-indigo-900/30 to-stone-900/40",
  restaurants: "from-rose-950/50 via-orange-900/25 to-stone-900/40",
  products: "from-sky-950/50 via-blue-900/25 to-stone-900/40",
  gifts: "from-pink-950/50 via-fuchsia-900/25 to-stone-900/40",
  travel: "from-teal-950/50 via-cyan-900/25 to-stone-900/40",
  recipes: "from-lime-950/50 via-green-900/25 to-stone-900/40",
  articles: "from-stone-800/50 via-stone-700/30 to-stone-900/40",
};

export function categoryPlaceholderClass(category: ItemCategory | null): string {
  if (!category) return "from-stone-800/40 via-stone-700/25 to-stone-900/35";
  return GRADIENTS[category];
}

export function categoryPlaceholderLabel(category: ItemCategory | null): string {
  return formatCategory(category);
}

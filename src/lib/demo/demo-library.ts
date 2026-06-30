import type { ItemCategory } from "@/lib/database.types";
import { defaultCardAspectForCategory } from "@/lib/item-display";
import { getShelf, type ShelfId } from "@/lib/shelves";

/**
 * Static, read-only sample library that powers the logged-out landing-page demo
 * (`<DemoLibrary />`). It is purely marketing data — no account, no network, no
 * Postgres, no real user data, no sharing surface — so the visitor can *feel*
 * the real product (enriched cards on shelves, color sort) before signing up.
 *
 * Covers are rendered as on-brand typographic tiles tinted with each item's
 * `dominantColor` (the same colour the real app extracts and uses for placeholder
 * tinting and the Spine Band), so the demo never hotlinks fragile remote images.
 */

export type DemoStatus = "want" | "done";

export type DemoItem = {
  id: string;
  title: string;
  /** Author / director / source — the card's secondary line. */
  subtitle: string;
  category: ItemCategory;
  status: DemoStatus;
  domain: string;
  /** Hex cover tint; mirrors the real `items.dominant_color`. */
  dominantColor: string;
  /** 1–5, present on finished (`done`) items. */
  rating?: number;
  /** Short taste verdict shown on finished items. */
  verdict?: string;
};

/** The shelves the demo strip renders, in order; labels reuse the real shelf defs. */
export const DEMO_SHELF_IDS = ["all", "books", "watch", "read", "other", "done"] as const;
export type DemoShelfId = (typeof DEMO_SHELF_IDS)[number];

export function demoShelfLabel(id: DemoShelfId): string {
  return getShelf(id as ShelfId).label;
}

export const DEMO_ITEMS: DemoItem[] = [
  {
    id: "d1",
    title: "The Left Hand of Darkness",
    subtitle: "Ursula K. Le Guin",
    category: "books",
    status: "want",
    domain: "goodreads.com",
    dominantColor: "#3b4a8c",
  },
  {
    id: "d2",
    title: "Dune",
    subtitle: "Frank Herbert",
    category: "books",
    status: "done",
    domain: "goodreads.com",
    dominantColor: "#c2873f",
    rating: 5,
    verdict: "Loved it",
  },
  {
    id: "d3",
    title: "Tomorrow, and Tomorrow, and Tomorrow",
    subtitle: "Gabrielle Zevin",
    category: "books",
    status: "want",
    domain: "goodreads.com",
    dominantColor: "#6d4aa0",
  },
  {
    id: "d4",
    title: "Piranesi",
    subtitle: "Susanna Clarke",
    category: "books",
    status: "want",
    domain: "goodreads.com",
    dominantColor: "#5f8f86",
  },
  {
    id: "d5",
    title: "Blade Runner 2049",
    subtitle: "Denis Villeneuve",
    category: "movies_and_tv",
    status: "done",
    domain: "imdb.com",
    dominantColor: "#c75a26",
    rating: 5,
    verdict: "Loved it",
  },
  {
    id: "d6",
    title: "Past Lives",
    subtitle: "Celine Song",
    category: "movies_and_tv",
    status: "want",
    domain: "letterboxd.com",
    dominantColor: "#b5798a",
  },
  {
    id: "d7",
    title: "The Bear",
    subtitle: "FX · Series",
    category: "movies_and_tv",
    status: "want",
    domain: "imdb.com",
    dominantColor: "#8e2f2a",
  },
  {
    id: "d8",
    title: "The Tyranny of the Marginal User",
    subtitle: "Ivan Vendrov",
    category: "articles",
    status: "want",
    domain: "nothinghuman.substack.com",
    dominantColor: "#4b5563",
  },
  {
    id: "d9",
    title: "How to Do Great Work",
    subtitle: "Paul Graham",
    category: "articles",
    status: "done",
    domain: "paulgraham.com",
    dominantColor: "#9a8c5a",
    rating: 4,
    verdict: "Great",
  },
  {
    id: "d10",
    title: "Septime",
    subtitle: "Paris · Restaurant",
    category: "restaurants",
    status: "want",
    domain: "maps.google.com",
    dominantColor: "#5f6b3a",
  },
  {
    id: "d11",
    title: "AeroPress Go",
    subtitle: "Travel coffee press",
    category: "products",
    status: "done",
    domain: "amazon.com",
    dominantColor: "#3a3a3c",
    rating: 4,
    verdict: "Worth it",
  },
  {
    id: "d12",
    title: "Ryokan in Higashiyama",
    subtitle: "Kyoto · Stay",
    category: "travel",
    status: "want",
    domain: "booking.com",
    dominantColor: "#2f6f6a",
  },
  {
    id: "d13",
    title: "Marcella's Tomato Sauce",
    subtitle: "NYT Cooking",
    category: "recipes",
    status: "done",
    domain: "cooking.nytimes.com",
    dominantColor: "#b23b2e",
    rating: 5,
    verdict: "Loved it",
  },
];

const OTHER_CATEGORIES: ItemCategory[] = ["restaurants", "products", "travel", "recipes"];

/**
 * Mirrors the real shelf semantics (`src/lib/shelves.ts`) for the demo data:
 * `all` keeps everything, the category backlogs exclude finished items, and
 * `done` is the single archive of finished items.
 */
export function demoItemMatchesShelf(item: DemoItem, shelfId: DemoShelfId): boolean {
  switch (shelfId) {
    case "all":
      return true;
    case "books":
      return item.category === "books" && item.status !== "done";
    case "watch":
      return item.category === "movies_and_tv" && item.status !== "done";
    case "read":
      return item.category === "articles" && item.status !== "done";
    case "other":
      return OTHER_CATEGORIES.includes(item.category) && item.status !== "done";
    case "done":
      return item.status === "done";
    default:
      return false;
  }
}

export function demoItemsForShelf(shelfId: DemoShelfId): DemoItem[] {
  return DEMO_ITEMS.filter((item) => demoItemMatchesShelf(item, shelfId));
}

/** Cover aspect ratio (`"2/3"` etc.), reusing the app's per-category defaults. */
export function demoCardAspect(category: ItemCategory): string {
  return defaultCardAspectForCategory(category);
}

/**
 * Hue (0–360) of a `#rrggbb` colour — the same axis the real library's color
 * sort uses (`dominant_hue`). Returns 0 for greys/unparseable input.
 */
export function hexToHue(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 0xff) / 255;
  const g = ((int >> 8) & 0xff) / 255;
  const b = (int & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

/** Stable sort of items along the color wheel (the demo's "color sort" toggle). */
export function sortDemoItemsByHue(items: DemoItem[]): DemoItem[] {
  return items
    .map((item, index) => ({ item, index, hue: hexToHue(item.dominantColor) }))
    .sort((a, b) => a.hue - b.hue || a.index - b.index)
    .map((entry) => entry.item);
}

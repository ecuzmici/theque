import type { ItemCategory } from "@/lib/database.types";

/** The slim projection the taste card needs from a user's items. */
export type TasteCardRow = {
  category: ItemCategory | null;
  status: string | null;
  dominant_color: string | null;
  dominant_hue: number | null;
  rating_personal: number | null;
  title: string | null;
};

export type TasteCardShelf = { label: string; count: number };

export type TasteCardSummary = {
  /** Total non-dismissed items. */
  total: number;
  /** Items marked done. */
  done: number;
  /** Completion as a 0–100 integer (0 when the library is empty). */
  completionPct: number;
  /** Top shelves by count (most-saved first), mapped to the shelf labels users see. */
  topShelves: TasteCardShelf[];
  /** Representative dominant colors, walked around the hue wheel (hex strings). */
  palette: string[];
  /** Highest-rated finished pick with a title, if any. */
  standout: { title: string; rating: number } | null;
  /** True when there is nothing worth putting on a card yet. */
  isEmpty: boolean;
};

/** Maps a category to the shelf label the library UI shows for it (mirrors `shelves.ts`). */
const CATEGORY_SHELF_LABEL: Record<ItemCategory, string> = {
  books: "Books",
  movies_and_tv: "Watch",
  articles: "Articles",
  restaurants: "Other",
  products: "Other",
  travel: "Other",
  recipes: "Other",
};

const MAX_PALETTE = 8;

function isDismissed(status: string | null): boolean {
  return status === "dismissed";
}

/** Normalizes a hue to [0, 360); returns a large sentinel so colorless items sink last. */
function hueKey(hue: number | null): number {
  if (hue === null || Number.isNaN(hue)) return Number.POSITIVE_INFINITY;
  return ((hue % 360) + 360) % 360;
}

/**
 * Pure summarizer for the private taste card. Operates on a user's already-fetched,
 * RLS-scoped rows — no I/O — so it is trivially unit-testable. Dismissed items are
 * excluded everywhere (they are not part of the user's taste).
 */
export function buildTasteCardSummary(rows: TasteCardRow[]): TasteCardSummary {
  const live = rows.filter((r) => !isDismissed(r.status));
  const total = live.length;
  const done = live.filter((r) => r.status === "done").length;
  const completionPct = total === 0 ? 0 : Math.round((done / total) * 100);

  // Shelf counts, most-saved first; ties broken by label for stable output.
  const shelfCounts = new Map<string, number>();
  for (const row of live) {
    if (!row.category) continue;
    const label = CATEGORY_SHELF_LABEL[row.category];
    shelfCounts.set(label, (shelfCounts.get(label) ?? 0) + 1);
  }
  const topShelves: TasteCardShelf[] = [...shelfCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 3);

  // Palette: unique dominant colors, walked around the hue wheel.
  const seen = new Set<string>();
  const palette: string[] = [];
  const colored = live
    .filter((r) => typeof r.dominant_color === "string" && r.dominant_color.length > 0)
    .sort((a, b) => hueKey(a.dominant_hue) - hueKey(b.dominant_hue));
  for (const row of colored) {
    const color = row.dominant_color as string;
    if (seen.has(color)) continue;
    seen.add(color);
    palette.push(color);
    if (palette.length >= MAX_PALETTE) break;
  }

  // Standout: highest-rated finished item that has a title.
  let standout: TasteCardSummary["standout"] = null;
  for (const row of live) {
    if (row.status !== "done") continue;
    if (typeof row.rating_personal !== "number") continue;
    if (!row.title) continue;
    if (!standout || row.rating_personal > standout.rating) {
      standout = { title: row.title, rating: row.rating_personal };
    }
  }

  return {
    total,
    done,
    completionPct,
    topShelves,
    palette,
    standout,
    isEmpty: total === 0,
  };
}

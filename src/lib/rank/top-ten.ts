import type { ItemCategory } from "@/lib/database.types";

import { isPlaced } from "./rank-key";
import type { Contender } from "./session";

/** The categories that Head to head ranks. */
export const RANK_CATEGORIES = ["books", "movies_and_tv"] as const;
export type RankCategory = (typeof RANK_CATEGORIES)[number];

/** Only items with this rating or more play matches. */
export const MIN_CONTENDER_RATING = 4;

export type RankableItem = {
  id: string;
  category: ItemCategory | null;
  status: string;
  rating: number | null;
  rankOrder: number | null;
  doneAt: string | null;
};

function rated<T extends RankableItem>(items: T[], category: RankCategory): Array<T & { rating: number }> {
  return items.filter(
    (i): i is T & { rating: number } => i.category === category && i.status === "done" && i.rating !== null,
  );
}

/** The items of one category that play matches, in the shape the session needs. */
export function contendersFor(items: RankableItem[], category: RankCategory): Contender[] {
  return rated(items, category)
    .filter((i) => i.rating >= MIN_CONTENDER_RATING)
    .map((i) => ({ id: i.id, rating: i.rating, rankOrder: i.rankOrder }));
}

/**
 * The ten best finished items of one category: rating desc, then the
 * head-to-head key asc (see `rank-key.ts`). Items with no valid key sort
 * after the placed items of their rating, the most recent finish first.
 */
export function topTen<T extends RankableItem>(items: T[], category: RankCategory): T[] {
  const key = (i: T & { rating: number }) =>
    i.rankOrder !== null && isPlaced(i.rating, i.rankOrder) ? i.rankOrder : Number.POSITIVE_INFINITY;
  return rated(items, category)
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        key(a) - key(b) ||
        (b.doneAt ?? "").localeCompare(a.doneAt ?? "") ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 10);
}

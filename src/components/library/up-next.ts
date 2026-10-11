import { RECOMMEND_MIN_ITEMS } from "@/lib/recommend/recommend-config";
import type { RecommendShelfId } from "@/lib/recommend/recommend-types";
import { itemMatchesShelf } from "@/lib/shelf-filter";
import type { LibraryItemRow } from "@/lib/types/library-item";

const DAY_MS = 86_400_000;

export type UpNextSource = {
  /** First page of the Books shelf. */
  books: LibraryItemRow[];
  /** First page of the Watch shelf. */
  watch: LibraryItemRow[];
  /** First page of the Forgotten shelf. */
  forgotten: LibraryItemRow[];
};

export type UpNextPicks = {
  tonight: LibraryItemRow | null;
  forgotten: LibraryItemRow | null;
  nextRead: LibraryItemRow | null;
  nextWatch: LibraryItemRow | null;
};

/** The day number (UTC days since the epoch) that keeps the picks stable for one day. */
export function dayNumber(now: number): number {
  return Math.floor(now / DAY_MS);
}

/** A stable index into a list of `length`, different per day and per slot. */
export function dailyIndex(length: number, day: number, salt: number): number {
  if (length <= 0) return 0;
  return (day * 31 + salt * 17) % length;
}

function isWanted(item: LibraryItemRow): boolean {
  return item.status === "want";
}

function dedupe(items: LibraryItemRow[]): LibraryItemRow[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}

/**
 * Selects the items for the Up next row. Each slot takes a different item.
 * The order of the slots sets the priority: Tonight, Forgotten, Next read, Next watch.
 * The forgotten slot uses the Forgotten shelf rule (`want`, older than
 * `FORGOTTEN_AFTER_DAYS`), so it is empty when no item is forgotten.
 * `tonight` replaces the daily Tonight pick (for example after a shuffle). The
 * other slots keep their daily items. A slot that holds that same item, or that
 * is empty, takes a free item.
 */
export function selectUpNext(
  source: UpNextSource,
  options: { day: number; tonight?: LibraryItemRow | null },
): UpNextPicks {
  const books = source.books.filter((i) => isWanted(i) && itemMatchesShelf(i, "books"));
  const watch = source.watch.filter((i) => isWanted(i) && itemMatchesShelf(i, "watch"));
  const forgotten = source.forgotten.filter((i) => itemMatchesShelf(i, "forgotten"));
  const wanted = dedupe([...books, ...watch, ...forgotten]);

  const used = new Set<string>();
  const take = (pool: LibraryItemRow[], salt: number): LibraryItemRow | null => {
    const free = pool.filter((i) => !used.has(i.id));
    const item = free[dailyIndex(free.length, options.day, salt)] ?? null;
    if (item) used.add(item.id);
    return item;
  };

  const daily: UpNextPicks = {
    tonight: take(wanted, 0),
    forgotten: take(forgotten, 1),
    nextRead: take(books, 2),
    nextWatch: take(watch, 3),
  };

  const override = options.tonight;
  if (!override) return daily;

  // Keep every daily slot that does not hold the override. Fill the other
  // slots from the items that are still free.
  used.clear();
  used.add(override.id);
  const keep = (item: LibraryItemRow | null) =>
    item && item.id !== override.id ? item : null;
  const kept = {
    forgotten: keep(daily.forgotten),
    nextRead: keep(daily.nextRead),
    nextWatch: keep(daily.nextWatch),
  };
  for (const item of Object.values(kept)) if (item) used.add(item.id);

  return {
    tonight: override,
    forgotten: kept.forgotten ?? take(forgotten, 1),
    nextRead: kept.nextRead ?? take(books, 2),
    nextWatch: kept.nextWatch ?? take(watch, 3),
  };
}

/** Whole months since `createdAt`, at least 1. */
export function monthsWaiting(createdAt: string, now: number): number {
  return Math.max(1, Math.floor((now - new Date(createdAt).getTime()) / (30 * DAY_MS)));
}

/** One recommendation category as the "Made for you" tile sees it. */
export type RecommendOption = {
  shelfId: RecommendShelfId;
  /** Titled, not-done items saved in this category. */
  saved: number;
  ready: boolean;
};

/**
 * What a tap on the "Made for you" tile does.
 * One ready category starts its picks at once. Other cases open a menu that
 * lists each category and how many saves it needs to unlock.
 */
export function madeForYouAction(
  options: RecommendOption[],
): { kind: "none" } | { kind: "start"; shelfId: RecommendShelfId } | { kind: "menu" } {
  if (options.length === 0) return { kind: "none" };
  if (options.length === 1 && options[0].ready) {
    return { kind: "start", shelfId: options[0].shelfId };
  }
  return { kind: "menu" };
}

/** The short line under the "Made for you" title. */
export function madeForYouEyebrow(options: RecommendOption[]): string {
  if (options.some((o) => o.ready)) return "Picks";
  const closest = Math.max(0, ...options.map((o) => o.saved));
  const remaining = Math.max(0, RECOMMEND_MIN_ITEMS - closest);
  return `${remaining} to unlock`;
}

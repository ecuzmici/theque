import type { LibraryItemRow } from "@/lib/types/library-item";

import type { UpNextSource } from "./up-next";

/** One loaded shelf (or shelf + chip filter) in the library page cache. */
export type ShelfCache = {
  items: LibraryItemRow[];
  hasMore: boolean;
};

type LibrarySnapshot = {
  userId: string;
  shelves: Partial<Record<string, ShelfCache>>;
  upNext: UpNextSource | null;
  scrollY: number | null;
  /** The "Hide done" toggle, so Back renders the same rows before localStorage is read. */
  hideDone: boolean | null;
  /** The item the user opened last from the library. Back refreshes it. */
  openedItemId: string | null;
};

/**
 * The library page unmounts when the user opens an item. This module keeps
 * what it loaded, so Back shows the same cards at the same scroll position at
 * once. The page then refreshes the first page and the opened item.
 *
 * The data lives in memory only: a reload starts empty. It belongs to one
 * user; another user id clears it.
 */
let snapshot: LibrarySnapshot | null = null;

/** When the last history traversal (Back or Forward) happened. */
let lastPopAt = Number.NEGATIVE_INFINITY;
const RESTORE_WINDOW_MS = 5000;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastPopAt = performance.now();
  });
}

function forUser(userId: string): LibrarySnapshot {
  if (snapshot?.userId !== userId) {
    snapshot = {
      userId,
      shelves: {},
      upNext: null,
      scrollY: null,
      hideDone: null,
      openedItemId: null,
    };
  }
  return snapshot;
}

/** The shelves loaded earlier in this tab for this user. */
export function readStoredShelves(userId: string): Partial<Record<string, ShelfCache>> {
  return forUser(userId).shelves;
}

export function storeShelves(userId: string, shelves: Partial<Record<string, ShelfCache>>) {
  forUser(userId).shelves = shelves;
}

export function readStoredUpNext(userId: string): UpNextSource | null {
  return forUser(userId).upNext;
}

export function storeUpNext(userId: string, source: UpNextSource) {
  forUser(userId).upNext = source;
}

export function readStoredHideDone(userId: string): boolean | null {
  return forUser(userId).hideDone;
}

export function storeHideDone(userId: string, hideDone: boolean) {
  forUser(userId).hideDone = hideDone;
}

export function storeScroll(userId: string, scrollY: number) {
  forUser(userId).scrollY = scrollY;
}

/**
 * The scroll position to restore. It is set only when this mount follows a
 * Back or Forward, so a link to the library still starts at the top.
 */
export function takeScrollToRestore(userId: string): number | null {
  const state = forUser(userId);
  const y = state.scrollY;
  state.scrollY = null;
  if (y == null || performance.now() - lastPopAt > RESTORE_WINDOW_MS) return null;
  return y;
}

export function storeOpenedItem(userId: string, itemId: string) {
  forUser(userId).openedItemId = itemId;
}

export function readOpenedItem(userId: string): string | null {
  return forUser(userId).openedItemId;
}

/** Test hook: forget everything. */
export function resetLibraryStore() {
  snapshot = null;
  lastPopAt = Number.NEGATIVE_INFINITY;
}

/**
 * Merges a fresh first page into a longer cached list. Rows of the fresh page
 * replace their cached copies. A cached row above the last fresh row that the
 * fresh page lacks has left the shelf, so it drops. Unchanged rows keep their
 * object, so memoized cards do not re-render.
 */
export function mergeFreshFirstPage(
  cached: LibraryItemRow[],
  fresh: LibraryItemRow[],
  freshHasMore: boolean,
): LibraryItemRow[] {
  const cachedById = new Map(cached.map((row) => [row.id, row]));
  const head = fresh.map((row) => {
    const old = cachedById.get(row.id);
    return old && JSON.stringify(old) === JSON.stringify(row) ? old : row;
  });
  // A first page without more pages is the whole shelf.
  if (!freshHasMore) return head;

  const freshIds = new Set(fresh.map((row) => row.id));
  const last = fresh[fresh.length - 1];
  const cut = last ? cached.findIndex((row) => row.id === last.id) : -1;
  const tail = (cut >= 0 ? cached.slice(cut + 1) : cached).filter((row) => !freshIds.has(row.id));
  return [...head, ...tail];
}

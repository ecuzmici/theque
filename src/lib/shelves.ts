import type { ItemCategory, ItemStatus } from "@/lib/database.types";

export type ShelfId =
  | "all"
  | "books"
  | "watch"
  | "read"
  | "other"
  | "forgotten"
  | "inbox";

export type ShelfDefinition = {
  id: ShelfId;
  label: string;
  filter: {
    status?: ItemStatus;
    category?: ItemCategory | ItemCategory[];
    excludeDismissed?: boolean;
    excludeInbox?: boolean;
    /** Only items older than this many days (the Forgotten shelf, see `isOlderThan`). */
    olderThanDays?: number;
  };
};

/** Items still wanted after this long count as forgotten. */
export const FORGOTTEN_AFTER_DAYS = 180;

/** The moment before which an item counts as "older than `days`". */
export function olderThanCutoff(days: number, now: number = Date.now()): Date {
  return new Date(now - days * 86_400_000);
}

/**
 * The age rule of the Forgotten shelf. An item is older than `days` when the
 * user saved it before the cutoff and did not keep it after the cutoff. A
 * "Keep" in spring cleaning sets `kept_at`, so the age starts again from then.
 */
export function isOlderThan(
  item: { created_at?: string | null; kept_at?: string | null },
  days: number,
  now: number = Date.now(),
): boolean {
  if (!item.created_at) return false;
  const cutoff = olderThanCutoff(days, now).getTime();
  if (Date.parse(item.created_at) >= cutoff) return false;
  return !item.kept_at || Date.parse(item.kept_at) < cutoff;
}

/** A forgotten item: status `want` and older than `days` (see `isOlderThan`). */
export function isForgotten(
  item: { status?: string; created_at?: string | null; kept_at?: string | null },
  days: number = FORGOTTEN_AFTER_DAYS,
  now: number = Date.now(),
): boolean {
  return item.status === "want" && isOlderThan(item, days, now);
}

/** Adds the `isOlderThan` rule to a query on `items`. */
export function applyOlderThan<
  Q extends { lt: (c: string, v: string) => Q; or: (filters: string) => Q },
>(query: Q, days: number, now: number = Date.now()): Q {
  const cutoff = olderThanCutoff(days, now).toISOString();
  return query.lt("created_at", cutoff).or(`kept_at.is.null,kept_at.lt."${cutoff}"`);
}

export const SHELVES: ShelfDefinition[] = [
  { id: "all", label: "All", filter: { excludeDismissed: true } },
  { id: "books", label: "Books", filter: { category: "books", excludeDismissed: true } },
  {
    id: "watch",
    label: "Watch",
    filter: { category: "movies_and_tv", excludeDismissed: true },
  },
  {
    id: "read",
    label: "Articles",
    filter: { category: "articles", excludeDismissed: true, excludeInbox: true },
  },
  {
    id: "other",
    label: "Other",
    filter: {
      category: ["restaurants", "products", "travel", "recipes"],
      excludeDismissed: true,
    },
  },
  {
    id: "forgotten",
    label: "Forgotten",
    filter: { status: "want", olderThanDays: FORGOTTEN_AFTER_DAYS },
  },
  { id: "inbox", label: "Inbox", filter: { status: "inbox" } },
];

export function getShelf(id: ShelfId): ShelfDefinition {
  const shelf = SHELVES.find((s) => s.id === id);
  if (!shelf) throw new Error(`Unknown shelf: ${id}`);
  return shelf;
}

/** Resolves `?shelf=` (or missing/unknown) to a shelf id for the library route. */
export function parseShelfParam(param: string | null | undefined): ShelfId {
  if (param && SHELVES.some((s) => s.id === param)) {
    return param as ShelfId;
  }
  return "all";
}

/**
 * The shelves the tab strip should render, in order. The strip is conservative:
 * `all`, `books`, `watch`, and `read` (Articles) are always shown, while `other`
 * and `inbox` appear only when they hold something. `forgotten` is never a tab
 * (it surfaces via the insights chip / digest instead). Consumed items live on
 * their category shelf now, not a separate Done shelf; the "Hide done" toggle
 * controls their visibility.
 */
export function visibleShelves(counts: Partial<Record<ShelfId, number>>): ShelfId[] {
  return SHELVES.filter((s) => {
    if (s.id === "forgotten") return false;
    if (s.id === "other" || s.id === "inbox") return (counts[s.id] ?? 0) > 0;
    return true;
  }).map((s) => s.id);
}

/**
 * The shelf the library should treat as active. Keeps the requested shelf while
 * it is visible; otherwise falls back to "all" so an emptied or unknown shelf
 * never strands the view on a vanished tab.
 */
export function resolveActiveShelf(requested: ShelfId, visible: ShelfId[]): ShelfId {
  return visible.includes(requested) ? requested : "all";
}

/**
 * Like `resolveActiveShelf`, but keeps `forgotten` reachable when it is the
 * explicitly requested shelf. `forgotten` is intentionally never a rendered tab
 * (`visibleShelves` excludes it), so a plain `?shelf=forgotten` link would be
 * bounced to "all". The insights chip links there, so an explicit request must
 * load the forgotten view even though no tab is shown for it.
 */
export function resolveRequestedShelf(requested: ShelfId, visible: ShelfId[]): ShelfId {
  if (requested === "forgotten") return "forgotten";
  return resolveActiveShelf(requested, visible);
}

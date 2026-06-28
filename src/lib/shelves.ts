import type { ItemCategory, ItemStatus } from "@/lib/database.types";

export type ShelfId =
  | "all"
  | "books"
  | "watch"
  | "read"
  | "other"
  | "done"
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
    /** Backlog shelves hide consumed items; All and Done keep them visible. */
    excludeDone?: boolean;
    /** Only items saved at least this many days ago (the Forgotten shelf). */
    olderThanDays?: number;
  };
};

/** Items still wanted after this long count as forgotten. */
export const FORGOTTEN_AFTER_DAYS = 180;

/** The moment before which an item counts as "older than `days`". */
export function olderThanCutoff(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

export const SHELVES: ShelfDefinition[] = [
  { id: "all", label: "All", filter: { excludeDismissed: true } },
  { id: "books", label: "Books", filter: { category: "books", excludeDismissed: true, excludeDone: true } },
  {
    id: "watch",
    label: "Watch",
    filter: { category: "movies_and_tv", excludeDismissed: true, excludeDone: true },
  },
  {
    id: "read",
    label: "Articles",
    filter: { category: "articles", excludeDismissed: true, excludeInbox: true, excludeDone: true },
  },
  {
    id: "other",
    label: "Other",
    filter: {
      category: ["restaurants", "products", "travel", "recipes"],
      excludeDismissed: true,
      excludeDone: true,
    },
  },
  { id: "done", label: "Done", filter: { status: "done" } },
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
 * `all`, `books`, `watch`, `read` (Articles), and `done` are always shown, while
 * `other` and `inbox` appear only when they hold something. `forgotten` is never
 * a tab (it surfaces via the insights chip / digest instead).
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

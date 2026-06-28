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
 * The shelves the tab strip should render, in order. Pass-through for now
 * (returns every shelf, ignoring counts); a later slice hides empty shelves.
 */
export function visibleShelves(_counts: Partial<Record<ShelfId, number>>): ShelfId[] {
  return SHELVES.map((s) => s.id);
}

/**
 * The shelf the library should treat as active. Pass-through for now (returns
 * the requested shelf); a later slice falls back to "all" when it is hidden.
 */
export function resolveActiveShelf(requested: ShelfId, _visible: ShelfId[]): ShelfId {
  return requested;
}

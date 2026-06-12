import type { ItemCategory, ItemStatus } from "@/lib/database.types";

export type ShelfId =
  | "all"
  | "books"
  | "watch"
  | "listen"
  | "eat"
  | "shop"
  | "travel"
  | "read"
  | "cook"
  | "tools"
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
  { id: "books", label: "Books", filter: { category: "books", excludeDismissed: true } },
  {
    id: "watch",
    label: "Watch",
    filter: { category: ["movies_and_tv", "videos"], excludeDismissed: true },
  },
  { id: "listen", label: "Listen", filter: { category: "music", excludeDismissed: true } },
  { id: "eat", label: "Eat", filter: { category: "restaurants", excludeDismissed: true } },
  { id: "shop", label: "Shop", filter: { category: "products", excludeDismissed: true } },
  { id: "travel", label: "Travel", filter: { category: "travel", excludeDismissed: true } },
  {
    id: "read",
    label: "Read",
    filter: { category: "articles", excludeDismissed: true, excludeInbox: true },
  },
  { id: "cook", label: "Cook", filter: { category: "recipes", excludeDismissed: true } },
  { id: "tools", label: "Tools", filter: { category: "apps", excludeDismissed: true } },
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

/** Resolves `?shelf=` (or missing) to a shelf id for the library route. */
export function parseShelfParam(param: string | null | undefined): ShelfId {
  if (param && SHELVES.some((s) => s.id === param)) {
    return param as ShelfId;
  }
  return "all";
}

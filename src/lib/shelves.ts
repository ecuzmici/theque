import type { ItemCategory, ItemStatus } from "@/lib/database.types";

export type ShelfId =
  | "all"
  | "books"
  | "watch"
  | "eat"
  | "shop"
  | "travel"
  | "read"
  | "cook"
  | "inbox";

export type ShelfDefinition = {
  id: ShelfId;
  label: string;
  filter: {
    status?: ItemStatus;
    category?: ItemCategory | ItemCategory[];
    excludeDismissed?: boolean;
    excludeInbox?: boolean;
  };
};

export const SHELVES: ShelfDefinition[] = [
  { id: "all", label: "All", filter: { excludeDismissed: true } },
  { id: "books", label: "Books", filter: { category: "books", excludeDismissed: true } },
  { id: "watch", label: "Watch", filter: { category: "movies_and_tv", excludeDismissed: true } },
  { id: "eat", label: "Eat", filter: { category: "restaurants", excludeDismissed: true } },
  {
    id: "shop",
    label: "Shop",
    filter: { category: ["products", "gifts"], excludeDismissed: true },
  },
  { id: "travel", label: "Travel", filter: { category: "travel", excludeDismissed: true } },
  {
    id: "read",
    label: "Read",
    filter: { category: "articles", excludeDismissed: true, excludeInbox: true },
  },
  { id: "cook", label: "Cook", filter: { category: "recipes", excludeDismissed: true } },
  { id: "inbox", label: "Inbox", filter: { status: "inbox" } },
];

export function getShelf(id: ShelfId): ShelfDefinition {
  const shelf = SHELVES.find((s) => s.id === id);
  if (!shelf) throw new Error(`Unknown shelf: ${id}`);
  return shelf;
}

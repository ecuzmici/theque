import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import { itemMatchesShelf } from "@/lib/shelf-filter";
import { getShelf, type ShelfId } from "@/lib/shelves";

/** Status filters that show under the shelf chips while a query is active. */
export const SEARCH_STATUS_FILTERS: { id: ItemStatus; label: string }[] = [
  { id: "want", label: "Want" },
  { id: "done", label: "Done" },
  { id: "inbox", label: "Inbox" },
];

/** True when the shelf already fixes one status, so the status chips do not apply. */
export function shelfFixesStatus(shelfId: ShelfId): boolean {
  return getShelf(shelfId).filter.status !== undefined;
}

export type LibrarySearchScope = {
  categories: ItemCategory[];
  statuses: ItemStatus[];
};

/**
 * Turns the active shelf and the optional status chip into the `category` and
 * `status` filters for `GET /api/items`. The shelf rules come from `shelves.ts`.
 */
export function searchScopeForShelf(
  shelfId: ShelfId,
  status: ItemStatus | null,
): LibrarySearchScope {
  const { filter } = getShelf(shelfId);
  const categories =
    filter.category === undefined
      ? []
      : Array.isArray(filter.category)
        ? filter.category
        : [filter.category];

  if (filter.status !== undefined) {
    return { categories, statuses: [filter.status] };
  }

  let statuses: ItemStatus[] = ["inbox", "want", "done"];
  if (!filter.excludeDismissed) statuses.push("dismissed");
  if (filter.excludeInbox) statuses = statuses.filter((s) => s !== "inbox");
  if (status) statuses = statuses.filter((s) => s === status);
  return { categories, statuses };
}

/** Keeps only the hits that belong on the shelf and match the status chip. */
export function filterSearchHits<
  T extends { status: ItemStatus; category: ItemCategory | null; created_at?: string },
>(items: T[], shelfId: ShelfId, status: ItemStatus | null): T[] {
  return items.filter(
    (item) =>
      itemMatchesShelf(item, shelfId) &&
      (status == null || shelfFixesStatus(shelfId) || item.status === status),
  );
}

/** The `/library` URL for a shelf and a search query. */
export function libraryHref(shelfId: ShelfId, q: string): string {
  const params = new URLSearchParams();
  if (shelfId !== "all") params.set("shelf", shelfId);
  const query = q.trim();
  if (query) params.set("q", query);
  const search = params.toString();
  return search ? `/library?${search}` : "/library";
}

/** Where the old `/search` route sends a request: `/search?q=x` goes to `/library?q=x`. */
export function searchRedirectHref(q: string | string[] | undefined): string {
  return libraryHref("all", (Array.isArray(q) ? q[0] : q) ?? "");
}

import type { LibrarySort } from "@/lib/library-items-for-shelf";
import type { ShelfId } from "@/lib/shelves";
import type { ItemsListResponseBody } from "@/lib/types/api";
import { libraryItemFromSummary, type LibraryItemRow } from "@/lib/types/library-item";

/**
 * Client-safe counterpart to `fetchLibraryItemsForShelf`: fetches a shelf page
 * through the decrypting `GET /api/items` endpoint instead of querying `items`
 * directly from the browser. `note`/`verdict` are ciphertext on the wire
 * (ADR 0013) — only a server boundary may decrypt them, so the browser must
 * never run this query against Supabase directly. Same call shape as the
 * server helper (minus the Supabase client) so call sites are a drop-in swap.
 */
export async function fetchLibraryItemsPage(
  shelfId: ShelfId,
  offset = 0,
  sort: LibrarySort = "recent",
  taste: { genre?: string | null; mood?: string | null } = {},
): Promise<{ items: LibraryItemRow[]; hasMore: boolean }> {
  const params = new URLSearchParams({ shelf: shelfId, sort, offset: String(offset) });
  if (taste.genre) params.set("genre", taste.genre);
  if (taste.mood) params.set("mood", taste.mood);
  const res = await fetch(`/api/items?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to load the ${shelfId} shelf (${res.status})`);
  }
  const body = (await res.json()) as ItemsListResponseBody;
  return {
    items: body.items.map(libraryItemFromSummary),
    hasMore: body.next_cursor !== null,
  };
}

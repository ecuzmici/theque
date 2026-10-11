"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { ItemGrid } from "@/components/items/ItemGrid";
import { Button } from "@/components/ui/button";
import { useDebouncedItemSearch } from "@/hooks/useItems";
import type { ItemStatus } from "@/lib/database.types";
import { applyItemPatch, type ItemPatchHandler } from "@/lib/item-patch";
import {
  SEARCH_STATUS_FILTERS,
  filterSearchHits,
  searchScopeForShelf,
} from "@/lib/library-search";
import { getShelf, type ShelfId } from "@/lib/shelves";
import { genreLabel, moodLabel, tasteShelfCategory } from "@/lib/taste/taste-lists";
import { libraryItemFromSummary, type LibraryItemRow } from "@/lib/types/library-item";
import { cn } from "@/lib/utils";

const SEARCH_LIMIT = 100;

type LibrarySearchResultsProps = {
  query: string;
  shelfId: ShelfId;
  status: ItemStatus | null;
  /** Genre key of the active chip, or null. */
  genre?: string | null;
  /** Mood key of the active chip, or null. */
  mood?: string | null;
  /** Called by the "Clear filter" button when a chip filter hides every hit. */
  onClearFilter?: () => void;
};

/** Search hits for the active shelf, shown in place of the shelf grid while a query is active. */
export function LibrarySearchResults({
  query,
  shelfId,
  status,
  genre = null,
  mood = null,
  onClearFilter,
}: LibrarySearchResultsProps) {
  const scope = searchScopeForShelf(shelfId, status);
  // An empty status list means the shelf and the chip exclude each other.
  const searchable = scope.statuses.length > 0;
  const { items, loading } = useDebouncedItemSearch(
    searchable
      ? {
          q: query,
          category: scope.categories,
          status: scope.statuses,
          limit: SEARCH_LIMIT,
          genre,
          mood,
        }
      : { q: "" },
  );

  const [rows, setRows] = useState<LibraryItemRow[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- local copy of the hits that optimistic patches can change
    setRows(items.map(libraryItemFromSummary));
  }, [items]);

  const onItemPatch = useCallback<ItemPatchHandler>(
    (itemId, patch, opts) => applyItemPatch(setRows, itemId, patch, opts),
    [],
  );

  const visible = useMemo(() => filterSearchHits(rows, shelfId, status), [rows, shelfId, status]);
  const busy = searchable && loading;

  const shelfText = shelfId === "all" ? "" : ` in ${getShelf(shelfId).label}`;
  const statusText = status
    ? ` · ${SEARCH_STATUS_FILTERS.find((s) => s.id === status)?.label ?? status}`
    : "";

  const category = tasteShelfCategory(shelfId);
  const filterText = [genre && genreLabel(category, genre), mood && moodLabel(mood)]
    .filter(Boolean)
    .map((label) => ` · ${label}`)
    .join("");
  const filtered = genre !== null || mood !== null;

  return (
    <section aria-label="Search results">
      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
        {busy && visible.length === 0
          ? "Searching…"
          : `${visible.length} for “${query}”${shelfText}${statusText}${filterText}`}
      </p>
      {busy && visible.length === 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <ItemCardSkeleton />
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <p>{filtered ? "Nothing matches this filter." : "Nothing matches. Try another shelf."}</p>
          {filtered && onClearFilter ? (
            <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={onClearFilter}>
              Clear filter
            </Button>
          ) : null}
        </div>
      ) : (
        <div className={cn("transition-opacity", busy && "opacity-60")}>
          <ItemGrid items={visible} shelfId={shelfId} itemActionsEnabled onItemPatch={onItemPatch} />
        </div>
      )}
    </section>
  );
}

import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { COVER_GRID_CLASS } from "@/components/items/ItemGrid";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for /library. Mirrors the top of LibraryPageClient (Up next
 * row, shelf tabs, toolbar) so the swap to the real page does not move the grid.
 * Keep in sync with `UpNextRow.tsx` and `LibraryPageClient.tsx`.
 */
export function LibraryPageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      {/* UpNextRow: heading row + 4 tiles (cover, eyebrow, title) */}
      <div className="mb-4" aria-hidden="true">
        <div className="mb-2 flex h-7 items-center justify-between">
          <Skeleton className="h-6 w-24 rounded" />
        </div>
        <div className="flex gap-3 overflow-hidden pb-1 pt-1 lg:px-1">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="w-24 shrink-0 lg:w-32">
              <Skeleton className="aspect-[2/3] w-full rounded-lg" />
              <div className="mt-1.5 h-[15px]" />
              <div className="h-4" />
            </div>
          ))}
        </div>
      </div>

      {/* Shelf tabs (min-h-11 pills) + ScrollArea pb-4 */}
      <div className="flex gap-2 overflow-hidden py-1.5 pb-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="pb-4" />

      {/* Toolbar (shuffle + wall) */}
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-11 w-32 rounded-lg" />
        <Skeleton className="h-11 w-11 rounded-lg" />
      </div>

      <ul className={COVER_GRID_CLASS}>
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i}>
            <ItemCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}

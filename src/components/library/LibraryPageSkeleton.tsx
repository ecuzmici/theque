import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for /library. Mirrors LibraryPageClient's masthead box model
 * EXACTLY — title + Spine Band + "Made for you" banner + shelf tabs + toolbar — so
 * whichever Suspense fallback shows (route `loading.tsx` or the in-page fallback in
 * `page.tsx`), the skeleton → real-page swap lands the grid in the same place with
 * ZERO jump. Verified: skeleton grid-top == loaded grid-top (505px). CLS can't see
 * this shift (it's a subtree replacement), so it must be prevented structurally.
 * Keep in sync with the masthead in `LibraryPageClient.tsx` (band/banner heights
 * mirror those components' own reserved states).
 */
export function LibraryPageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      {/* PageHeader title="Library" — mb-6, h1 text-3xl, no description */}
      <header className="mb-6">
        <Skeleton className="h-9 w-40 rounded-lg" />
      </header>

      {/* LibrarySpineBand reserved height (band + caption line + rule) */}
      <div className="mb-5" aria-hidden="true">
        <div className="mb-3 h-11 w-full rounded-lg bg-muted/20" />
        <div className="h-5 w-48 max-w-[60%] rounded bg-muted/20" />
        <div className="mt-4 border-t border-border" />
      </div>

      {/* "Made for you" banner reserved height */}
      <div
        className="mb-5 min-h-[6.125rem] rounded-2xl border border-border bg-muted/20"
        aria-hidden="true"
      />

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

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i}>
            <ItemCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}

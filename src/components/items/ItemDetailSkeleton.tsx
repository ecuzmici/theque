import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading fallback for the item detail route. It mirrors the ItemDetail layout:
 * a centered cover, the title block under it, the rating card, and the actions.
 */
export function ItemDetailSkeleton() {
  return (
    <article aria-busy="true" aria-live="polite" className="pb-12">
      <Skeleton className="h-11 w-24 rounded-md lg:h-5" />

      <div className="mt-4 flex flex-col items-center">
        <Skeleton className="aspect-[2/3] h-72 rounded-lg sm:h-80 lg:h-96" />

        <header className="mt-6 flex w-full max-w-2xl flex-col items-center">
          <Skeleton className="h-3 w-20 rounded-sm" />
          <Skeleton className="mt-3 h-9 w-full max-w-md rounded-lg lg:h-10" />
          <Skeleton className="mt-3 h-4 w-full max-w-xs rounded-md" />
        </header>

        <Skeleton className="mt-6 h-28 w-full max-w-md rounded-2xl sm:h-24" />

        <div className="mt-4 flex justify-center gap-2">
          <Skeleton className="h-11 w-36 rounded-full lg:h-8" />
          <Skeleton className="size-11 rounded-full lg:size-8" />
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-2xl space-y-2">
        <Skeleton className="h-3 w-16 rounded-sm" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full rounded-md" />
        ))}
      </div>
    </article>
  );
}

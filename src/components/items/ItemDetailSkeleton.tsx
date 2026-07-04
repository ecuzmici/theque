import { Skeleton } from "@/components/ui/skeleton";

/** Loading fallback for the item detail route while its data loads. */
export function ItemDetailSkeleton() {
  return (
    <article aria-busy="true" aria-live="polite" className="pb-12">
      <Skeleton className="h-11 w-24 rounded-md lg:h-5" />

      <Skeleton className="mt-4 h-[min(40vh,28rem)] w-full rounded-xl" />

      <header className="mt-6">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-20 rounded-full" />
          ))}
        </div>

        <Skeleton className="mt-4 h-9 w-full max-w-2xl rounded-lg" />
        <Skeleton className="mt-3 h-5 w-full max-w-md rounded-md" />

        <div className="mt-5 flex flex-wrap gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-32 rounded-lg lg:h-8" />
          ))}
        </div>
      </header>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </article>
  );
}

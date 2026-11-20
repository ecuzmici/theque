import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder while the server asks Hardcover and TMDB. */
export function RadarSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading releases">
      <Skeleton className="h-4 w-3/4 max-w-md" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-16 rounded-full" />
        <Skeleton className="h-10 w-20 rounded-full" />
        <Skeleton className="h-10 w-20 rounded-full" />
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="flex gap-4 rounded-2xl border border-border p-3">
            <Skeleton className="aspect-[2/3] w-[4.5rem] shrink-0 sm:w-24" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

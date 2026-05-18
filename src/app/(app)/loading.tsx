import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="mb-6 space-y-3">
        <Skeleton className="h-9 w-44 rounded-lg" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>

      <div className="mb-6 flex gap-2 overflow-hidden pb-1">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
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

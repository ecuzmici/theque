import { ItemGridSkeleton } from "@/components/items/ItemCardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="mb-6 space-y-3">
        <Skeleton className="h-8 w-44 rounded-lg" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>

      <div className="mb-6 flex gap-6 overflow-hidden border-b border-border pb-3 pt-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-14 shrink-0" />
        ))}
      </div>

      <ItemGridSkeleton />
    </div>
  );
}

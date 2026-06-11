import { Skeleton } from "@/components/ui/skeleton";

export function ItemCardSkeleton({ aspect = "2 / 3" }: { aspect?: string }) {
  return (
    <div>
      <Skeleton className="w-full rounded-lg" style={{ aspectRatio: aspect }} />
      <div className="space-y-1.5 px-0.5 pt-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}

/* Varied ratios so the loading state already reads as a masonry wall */
const SKELETON_ASPECTS = ["2 / 3", "3 / 4", "2 / 3", "1 / 1", "3 / 4", "2 / 3", "4 / 3", "2 / 3"];

export function ItemGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="columns-2 gap-3 sm:columns-3 lg:columns-4 lg:gap-4">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="mb-4 break-inside-avoid lg:mb-5">
          <ItemCardSkeleton aspect={SKELETON_ASPECTS[i % SKELETON_ASPECTS.length]} />
        </li>
      ))}
    </ul>
  );
}


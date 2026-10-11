import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder for one cover-wall card: a 2:3 cover, a title line, and a byline line. */
export function ItemCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[2/3] w-full rounded-md" />
      <Skeleton className="mt-1.5 h-3.5 w-4/5" />
      <Skeleton className="mt-1 h-3 w-1/2" />
    </div>
  );
}

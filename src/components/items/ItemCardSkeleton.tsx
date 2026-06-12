import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ItemCardSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Skeleton className="aspect-[2/3] w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </Card>
  );
}

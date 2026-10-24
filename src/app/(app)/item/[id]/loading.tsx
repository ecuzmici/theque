import { ItemDetailSkeleton } from "@/components/items/ItemDetailSkeleton";

// Route-level fallback for /item/[id]. The library prefetches the route up to
// this boundary, so a tap shows the item skeleton at once instead of the
// generic (app) grid skeleton.
export default function ItemLoading() {
  return <ItemDetailSkeleton />;
}

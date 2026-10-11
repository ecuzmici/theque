"use client";

import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { Hourglass } from "lucide-react";
import { useCallback } from "react";
import { InboxActions } from "@/components/inbox/InboxActions";
import { ItemCardActions } from "@/components/items/ItemCardActions";
import {
  ItemCardVerdictControl,
  ItemCardVerdictDisplay,
} from "@/components/items/ItemCardVerdictControl";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  categoryPlaceholderClass,
  categoryPlaceholderLabel,
} from "@/lib/category-placeholder";
import { cardAspectRatio, getDisplayImageUrl } from "@/lib/item-display";
import { formatStatus } from "@/lib/item-labels";
import { FORGOTTEN_AFTER_DAYS } from "@/lib/shelves";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";
import type { ItemPatch, ItemPatchHandler, ItemPatchOptions } from "@/lib/item-patch";
import { cn } from "@/lib/utils";

type ItemCardProps = {
  item: LibraryItemRow;
  shelfId: ShelfId;
  itemActionsEnabled?: boolean;
  inboxActionsEnabled?: boolean;
  /** Imagery-only presentation: no caption, covers carry the wall. */
  wall?: boolean;
  /** Keyboard-navigation highlight from the library page. */
  selected?: boolean;
  onItemPatch?: ItemPatchHandler;
  onOpenMarkDone?: (item: LibraryItemRow) => void;
};

function monthsOnShelf(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (30 * 86_400_000));
}

export function ItemCard({
  item,
  shelfId,
  itemActionsEnabled,
  inboxActionsEnabled,
  wall,
  selected,
  onItemPatch,
  onOpenMarkDone,
}: ItemCardProps) {
  const router = useRouter();
  const detailHref = `/item/${item.id}`;
  // Warm the item route on hover / focus / press-in — well before the click — so the
  // cover morph starts promptly instead of stalling on the server fetch.
  const prefetchDetail = useCallback(() => {
    router.prefetch(detailHref);
  }, [router, detailHref]);

  const aspect = cardAspectRatio(item.category, item.display);
  const [aw, ah] = aspect.split("/").map(Number);
  const ratioStyle =
    aw > 0 && ah > 0 ? ({ aspectRatio: `${aw} / ${ah}` } as const) : ({ aspectRatio: "2 / 3" } as const);

  const processing =
    item.processing_status === "pending" || item.processing_status === "processing";
  const imgSrc = getDisplayImageUrl(item.image_storage_path, item.image_url);
  const dusty =
    item.status === "want" &&
    Date.now() - new Date(item.created_at).getTime() > FORGOTTEN_AFTER_DAYS * 86_400_000;

  const handleOptimistic = useCallback(
    (patch: ItemPatch, opts?: ItemPatchOptions) => onItemPatch?.(item.id, patch, opts),
    [item.id, onItemPatch],
  );

  const showVerdictControl =
    itemActionsEnabled && !wall && !inboxActionsEnabled && item.status !== "inbox";

  return (
    <Card
      data-item-card={item.id}
      className={cn(
        "group relative gap-0 overflow-hidden py-0 transition hover:ring-foreground/20",
        selected && "ring-2 ring-ring",
      )}
    >
      {inboxActionsEnabled ? (
        <div className="absolute right-2 top-2 z-10">
          <InboxActions itemId={item.id} category={item.category} onOptimistic={handleOptimistic} />
        </div>
      ) : itemActionsEnabled && !wall ? (
        <div className="absolute right-2 top-2 z-10">
          <ItemCardActions item={item} shelfId={shelfId} onItemPatch={onItemPatch} />
        </div>
      ) : null}

      <Link
        href={detailHref}
        aria-label={item.title ?? item.domain}
        onPointerEnter={prefetchDetail}
        onFocus={prefetchDetail}
        onPointerDown={prefetchDetail}
        className="block outline-none transition-transform duration-100 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
          <div
            className={cn(
              "relative w-full bg-muted",
              processing && !imgSrc && "ks-shimmer",
              !imgSrc && !item.dominant_color && `bg-gradient-to-br ${categoryPlaceholderClass(item.category)}`,
            )}
            style={{
              ...ratioStyle,
              // Extracted cover color doubles as loading base and imageless tint.
              ...(item.dominant_color ? { backgroundColor: item.dominant_color } : null),
            }}
          >
            {imgSrc ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy. */}
                <img
                  src={imgSrc}
                  alt=""
                  className={cn("absolute inset-0 h-full w-full object-cover transition", processing && "opacity-75")}
                />
                {processing ? (
                  <div className="pointer-events-none absolute inset-0 ks-shimmer bg-transparent" />
                ) : null}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
                {processing ? (
                  <span className="text-xs text-white/80">Gathering details…</span>
                ) : (
                  <>
                    <span className="font-serif text-sm font-medium text-white/90">
                      {categoryPlaceholderLabel(item.category)}
                    </span>
                    <span className="mt-1 break-all text-[11px] text-white/70">{item.domain}</span>
                  </>
                )}
              </div>
            )}
            {wall ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-8 opacity-0 transition group-hover:opacity-100">
                <p className="line-clamp-2 text-xs font-medium text-white">
                  {item.title ?? item.domain}
                </p>
              </div>
            ) : null}
          </div>

        {wall ? null : (
          <div className="p-3">
            <p className="line-clamp-2 font-serif text-[15px] font-semibold leading-snug tracking-tight text-card-foreground">
              {item.title ?? item.domain}
            </p>
            {item.subtitle ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.subtitle}</p>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {item.status === "inbox" ? (
                <Badge variant="secondary" className="mt-2 text-[10px]">
                  {formatStatus(item.status)}
                </Badge>
              ) : null}
              {dusty ? (
                <Badge variant="outline" className="mt-2 gap-1 text-[10px] text-muted-foreground">
                  <Hourglass className="size-2.5" aria-hidden />
                  {monthsOnShelf(item.created_at)} mo on the shelf
                </Badge>
              ) : null}
            </div>
            <ItemCardVerdictDisplay item={item} />
          </div>
        )}
      </Link>

      {showVerdictControl ? (
        <ItemCardVerdictControl item={item} onOpenMarkDone={onOpenMarkDone} />
      ) : null}
    </Card>
  );
}

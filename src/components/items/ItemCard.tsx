"use client";

import Link from "next/link";
import { useCallback } from "react";

import { InboxActions } from "@/components/inbox/InboxActions";
import { ItemCardActions } from "@/components/items/ItemCardActions";
import { Badge } from "@/components/ui/badge";
import { categoryPlaceholderLabel } from "@/lib/category-placeholder";
import { cardAspectRatio, getDisplayImageUrl } from "@/lib/item-display";
import { formatStatus } from "@/lib/item-labels";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import { cn } from "@/lib/utils";


type ItemCardProps = {
  item: LibraryItemRow;
  shelfId: ShelfId;
  itemActionsEnabled?: boolean;
  inboxActionsEnabled?: boolean;
  onItemPatch?: (
    itemId: string,
    patch: Partial<LibraryItemRow> & { status?: ItemStatus; category?: ItemCategory | null },
    opts?: { remove?: boolean },
  ) => void;
};

export function ItemCard({
  item,
  shelfId,
  itemActionsEnabled,
  inboxActionsEnabled,
  onItemPatch,
}: ItemCardProps) {
  const aspect = cardAspectRatio(item.category, item.display);
  const [aw, ah] = aspect.split("/").map(Number);
  const ratioStyle =
    aw > 0 && ah > 0 ? ({ aspectRatio: `${aw} / ${ah}` } as const) : ({ aspectRatio: "2 / 3" } as const);

  const processing =
    item.processing_status === "pending" || item.processing_status === "processing";
  const imgSrc = getDisplayImageUrl(item.image_storage_path, item.image_url);

  const handleOptimistic = useCallback(
    (
      patch: Partial<LibraryItemRow> & { status?: ItemStatus; category?: ItemCategory | null },
      opts?: { remove?: boolean },
    ) => {
      onItemPatch?.(item.id, patch, opts);
    },
    [item.id, onItemPatch],
  );

  return (
    <article className="group relative">
      {inboxActionsEnabled ? (
        <div className="absolute right-2 top-2 z-10">
          <InboxActions itemId={item.id} category={item.category} onOptimistic={handleOptimistic} />
        </div>
      ) : itemActionsEnabled ? (
        /* Mouse UIs reveal actions on hover/focus; touch keeps them always visible */
        <div className="absolute right-2 top-2 z-10 lg-fine:opacity-0 lg-fine:transition-opacity lg-fine:group-focus-within:opacity-100 lg-fine:group-hover:opacity-100">
          <ItemCardActions item={item} shelfId={shelfId} onItemPatch={onItemPatch} />
        </div>
      ) : null}

      <Link
        href={`/item/${item.id}`}
        className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-lg border border-border bg-muted transition-colors group-hover:border-foreground/30",
            processing && !imgSrc && "ks-shimmer",
          )}
          style={ratioStyle}
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
                <span className="text-xs text-muted-foreground">Gathering details…</span>
              ) : (
                <>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {categoryPlaceholderLabel(item.category)}
                  </span>
                  <span className="mt-1.5 break-all text-[11px] text-muted-foreground/80">{item.domain}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-0.5 pt-2">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug tracking-tight text-foreground">
            {item.title ?? item.domain}
          </p>
          <p className="mt-0.5 line-clamp-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {item.subtitle ?? item.domain}
          </p>
          {item.status === "inbox" ? (
            <Badge
              variant="outline"
              className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              {formatStatus(item.status)}
            </Badge>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

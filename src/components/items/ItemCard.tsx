"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback } from "react";

import { InboxActions } from "@/components/inbox/InboxActions";
import { cardAspectRatio } from "@/lib/item-display";
import type { LibraryItemRow } from "@/lib/types/library-item";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";

function safeRemoteImageUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.href;
  } catch {
    return null;
  }
}

type ItemCardProps = {
  item: LibraryItemRow;
  inboxActionsEnabled?: boolean;
  onItemPatch?: (
    itemId: string,
    patch: Partial<LibraryItemRow> & { status?: ItemStatus; category?: ItemCategory | null },
    opts?: { remove?: boolean },
  ) => void;
};

export function ItemCard({ item, inboxActionsEnabled, onItemPatch }: ItemCardProps) {
  const aspect = cardAspectRatio(item.category, item.display);
  const [aw, ah] = aspect.split("/").map(Number);
  const ratioStyle =
    aw > 0 && ah > 0 ? ({ aspectRatio: `${aw} / ${ah}` } as const) : ({ aspectRatio: "2 / 3" } as const);

  const processing =
    item.processing_status === "pending" || item.processing_status === "processing";
  const imgSrc = safeRemoteImageUrl(item.image_url);

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
    <div className="group relative overflow-hidden rounded-[var(--ks-radius-card)] border border-[color:var(--ks-border)] bg-[color:var(--ks-surface)] shadow-[var(--ks-shadow)] transition hover:shadow-[var(--ks-shadow-md)]">
      {inboxActionsEnabled ? (
        <div className="absolute right-2 top-2 z-10">
          <InboxActions itemId={item.id} category={item.category} onOptimistic={handleOptimistic} />
        </div>
      ) : null}

      <Link
        href={`/item/${item.id}`}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ks-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ks-bg)]"
      >
        <div
          className={`relative w-full bg-[color:var(--ks-bg-muted)] ${processing && !imgSrc ? "ks-shimmer" : ""}`}
          style={ratioStyle}
        >
          {imgSrc ? (
            <>
              <Image
                src={imgSrc}
                alt=""
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
                className={`object-cover ${processing ? "opacity-75" : ""}`}
              />
              {processing ? (
                <div className="pointer-events-none absolute inset-0 ks-shimmer bg-transparent" />
              ) : null}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
              {processing ? (
                <span className="text-xs text-[color:var(--ks-fg-muted)]">Gathering details…</span>
              ) : (
                <span className="break-all text-xs text-[color:var(--ks-fg-muted)]">{item.domain}</span>
              )}
            </div>
          )}
        </div>

        <div className="p-3">
          <p className="line-clamp-2 font-serif text-[15px] font-semibold leading-snug tracking-tight text-[color:var(--ks-fg)]">
            {item.title ?? item.domain}
          </p>
          {item.subtitle ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-[color:var(--ks-fg-muted)]">{item.subtitle}</p>
          ) : null}
        </div>
      </Link>
    </div>
  );
}

"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getDisplayImageUrl } from "@/lib/item-display";
import { formatCategory, formatStatus } from "@/lib/item-labels";
import type { LibraryItemRow } from "@/lib/types/library-item";

/** Spacebar quick look: flip through a shelf without leaving the wall. */
export function QuickLookDialog({
  item,
  open,
  onOpenChange,
  onNext,
  onPrev,
}: {
  item: LibraryItemRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNext?: () => void;
  onPrev?: () => void;
}) {
  if (!item) return null;
  const imgSrc = getDisplayImageUrl(item.image_storage_path, item.image_url);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-0"
        /* The dialog's focus trap keeps window-level key handlers from firing,
           so shelf flipping is handled here while the quick look is open. */
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "j") {
            e.preventDefault();
            onNext?.();
          } else if (e.key === "ArrowLeft" || e.key === "k") {
            e.preventDefault();
            onPrev?.();
          }
        }}
      >
        <div
          className="max-h-[55vh] w-full overflow-hidden bg-muted"
          style={item.dominant_color ? { backgroundColor: item.dominant_color } : undefined}
        >
          {imgSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy. */}
              <img src={imgSrc} alt="" className="h-full max-h-[55vh] w-full object-contain" />
            </>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              {item.domain}
            </div>
          )}
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{formatStatus(item.status)}</Badge>
            {item.category ? <Badge variant="outline">{formatCategory(item.category)}</Badge> : null}
          </div>
          <DialogTitle className="mt-3 font-serif text-xl leading-snug tracking-tight">
            {item.title ?? item.domain}
          </DialogTitle>
          {item.subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{item.subtitle}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button nativeButton={false} render={<Link href={`/item/${item.id}`} />} className="min-h-11 lg-fine:min-h-8">
              Open item
            </Button>
            <Button
              nativeButton={false}
              variant="outline"
              render={<a href={item.canonical_url} target="_blank" rel="noopener noreferrer" />}
              className="min-h-11 gap-1.5 lg-fine:min-h-8"
            >
              <ExternalLink className="size-4" />
              {item.domain}
            </Button>
          </div>
          <p className="mt-4 hidden text-[11px] text-muted-foreground lg:block">
            ←/→ or J/K to flip through the shelf · Esc to close
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { CheckCircle2, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { ItemMarkDoneDialog } from "@/components/items/ItemMarkDoneDialog";
import { Button } from "@/components/ui/button";
import { doneVerb } from "@/lib/item-labels";
import { itemMatchesShelf } from "@/lib/shelf-filter";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";
import type { ItemStatus } from "@/lib/database.types";
import { cn } from "@/lib/utils";

type ItemCardVerdictControlProps = {
  item: LibraryItemRow;
  shelfId: ShelfId;
  onItemPatch?: (
    itemId: string,
    patch: Partial<LibraryItemRow> & { status?: ItemStatus },
    opts?: { remove?: boolean },
  ) => void;
};

export function ItemCardVerdictControl({ item, shelfId, onItemPatch }: ItemCardVerdictControlProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const markedDoneRef = useRef(false);
  const verb = doneVerb(item.category);
  const isDone = item.status === "done";
  const title = item.title ?? item.domain;

  const finishShelfTransition = useCallback(() => {
    if (!markedDoneRef.current) return;
    markedDoneRef.current = false;
    const doneItem = { ...item, status: "done" as const };
    onItemPatch?.(item.id, doneItem, {
      remove: !itemMatchesShelf(doneItem, shelfId),
    });
  }, [item, onItemPatch, shelfId]);

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      setDialogOpen(open);
      if (!open) finishShelfTransition();
    },
    [finishShelfTransition],
  );

  const markDoneAndOpen = useCallback(async () => {
    const patch = { status: "done" as const, done_at: new Date().toISOString() };
    markedDoneRef.current = true;
    onItemPatch?.(item.id, patch, { remove: false });
    setDialogOpen(true);
    setBusy(true);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      if (!res.ok) {
        markedDoneRef.current = false;
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }, [item, onItemPatch, router]);

  const handleActivate = useCallback(() => {
    if (isDone) setDialogOpen(true);
    else void markDoneAndOpen();
  }, [isDone, markDoneAndOpen]);

  return (
    <>
      <div className="border-t border-border px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <Button
          type="button"
          variant={isDone ? "outline" : "secondary"}
          size="sm"
          className="h-9 w-full min-h-9 gap-1.5 text-xs font-medium"
          disabled={busy}
          onClick={() => void handleActivate()}
        >
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
          {isDone ? "Edit verdict" : `Mark ${verb}`}
        </Button>
      </div>

      <ItemMarkDoneDialog
        key={item.id}
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        verb={verb}
        title={title}
        initialRating={item.rating_personal}
        initialVerdict={item.verdict}
        onSave={async (rating, verdict) => {
          const patch = { rating_personal: rating, verdict };
          onItemPatch?.(item.id, patch);
          const res = await fetch(`/api/items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          if (!res.ok) {
            router.refresh();
            return false;
          }
          return true;
        }}
      />
    </>
  );
}

export function ItemCardVerdictDisplay({ item }: { item: LibraryItemRow }) {
  if (item.status !== "done") return null;
  if (item.rating_personal == null && !item.verdict) return null;

  return (
    <div className="mt-2 space-y-1">
      {item.rating_personal != null ? (
        <div
          className="flex items-center gap-0.5"
          aria-label={`${item.rating_personal} of 5 stars`}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={cn(
                "size-3.5",
                n <= (item.rating_personal ?? 0)
                  ? "fill-amber-500 text-amber-500"
                  : "text-muted-foreground/40",
              )}
              aria-hidden
            />
          ))}
        </div>
      ) : null}
      {item.verdict ? (
        <p className="line-clamp-2 font-serif text-xs italic leading-snug text-muted-foreground">
          &ldquo;{item.verdict}&rdquo;
        </p>
      ) : null}
    </div>
  );
}

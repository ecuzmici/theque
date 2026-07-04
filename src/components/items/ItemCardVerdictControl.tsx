"use client";

import { CheckCircle2, Star } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { doneVerb } from "@/lib/item-labels";
import type { LibraryItemRow } from "@/lib/types/library-item";
import { cn } from "@/lib/utils";

type ItemCardVerdictControlProps = {
  item: LibraryItemRow;
  onOpenMarkDone?: (item: LibraryItemRow) => void;
};

// The dialog is intentionally NOT rendered here. It lives in LibraryItemsSection
// so that a realtime event removing this item from the shelf list (e.g. with
// "Hide done" on) cannot unmount the dialog mid-interaction.
export function ItemCardVerdictControl({ item, onOpenMarkDone }: ItemCardVerdictControlProps) {
  const verb = doneVerb(item.category);
  const isDone = item.status === "done";

  const handleActivate = useCallback(() => {
    onOpenMarkDone?.(item);
  }, [item, onOpenMarkDone]);

  return (
    <div className="border-t border-border px-3 py-2" onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        variant={isDone ? "outline" : "secondary"}
        size="sm"
        className="h-9 w-full min-h-9 gap-1.5 text-xs font-medium"
        onClick={handleActivate}
      >
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
        {isDone ? "Edit verdict" : `Mark ${verb}`}
      </Button>
    </div>
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

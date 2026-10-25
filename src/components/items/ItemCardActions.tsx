"use client";

import { CheckCircle2, ExternalLink, MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import { CATEGORY_LABELS, doneVerb, formatCategory, formatStatus } from "@/lib/item-labels";
import { itemMatchesShelf } from "@/lib/shelf-filter";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";
import type { ItemPatch, ItemPatchHandler } from "@/lib/item-patch";
import { isPinned, PINS_CHANGED_EVENT, setPinnedRequest } from "@/lib/items/pins";
import { patchItemRequest, reportSaveError } from "@/lib/save-error";
import { cn } from "@/lib/utils";

import { cardTitle } from "./ItemCardCover";

const STATUS_ACTIONS: ItemStatus[] = ["want", "dismissed"];
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ItemCategory[];

type ItemCardActionsProps = {
  item: LibraryItemRow;
  shelfId: ShelfId;
  onItemPatch?: ItemPatchHandler;
  /** Opens the mark-done / verdict dialog. The menu hides the entry when this is missing. */
  onOpenMarkDone?: (item: LibraryItemRow) => void;
  /** Controlled open state, so a long-press on the card can open the menu. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
  /**
   * False renders a look-alike trigger without the menu root. A wall of cards
   * mounts much faster this way. The card sets it true on first hover, focus,
   * or long-press; a click on the stand-in also mounts and opens the menu.
   */
  menuMounted?: boolean;
};

function safeHttpUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** Quick actions for one card: mark done, pin, open original, status or inbox triage, delete. */
export function ItemCardActions({
  item,
  shelfId,
  onItemPatch,
  onOpenMarkDone,
  open,
  onOpenChange,
  triggerClassName,
  menuMounted = true,
}: ItemCardActionsProps) {
  const router = useRouter();
  // The stand-in trigger asks for the menu: open it, or keep focus on the trigger.
  const [standInUsed, setStandInUsed] = useState<"open" | "focus" | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // The delete dialog mounts on first use. A dialog root in every card made
  // each grid render and each page of cards heavier.
  const [deleteUsed, setDeleteUsed] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const originalUrl = useMemo(() => safeHttpUrl(item.canonical_url), [item.canonical_url]);
  const title = cardTitle(item);
  const inbox = item.status === "inbox";
  const pinned = isPinned(item);
  // Only an item still to do can have a pin. An old pinned row can always lose it.
  const canPin = pinned || item.status === "want";

  const applyPatch = useCallback(
    async (patch: ItemPatch) => {
      const undo = onItemPatch?.(item.id, patch, {
        remove: !itemMatchesShelf({ ...item, ...patch }, shelfId),
      });
      setBusy(true);
      try {
        // The list lives in client state, so a refresh does not undo the
        // optimistic change. Undo it here and tell the user.
        if (!(await patchItemRequest(item.id, patch))) {
          undo?.();
          reportSaveError();
        }
      } finally {
        setBusy(false);
      }
    },
    [item, onItemPatch, shelfId],
  );

  const togglePin = useCallback(async () => {
    const next = !pinned;
    const undo = onItemPatch?.(item.id, { pinned_at: next ? new Date().toISOString() : null });
    setBusy(true);
    try {
      const result = await setPinnedRequest(item.id, next);
      if (!result) {
        undo?.();
        reportSaveError();
        return;
      }
      // The new pin replaced the oldest pin of its category.
      for (const id of result.unpinnedIds) onItemPatch?.(id, { pinned_at: null });
      window.dispatchEvent(new Event(PINS_CHANGED_EVENT));
    } finally {
      setBusy(false);
    }
  }, [item.id, onItemPatch, pinned]);

  const deleteItem = useCallback(async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError("Could not delete this item.");
        return;
      }
      setDeleteOpen(false);
      onItemPatch?.(item.id, {}, { remove: true });
      router.refresh();
    } finally {
      setDeleteBusy(false);
    }
  }, [item.id, onItemPatch, router]);

  const triggerProps = {
    type: "button" as const,
    size: "icon-sm" as const,
    variant: "secondary" as const,
    className: cn("rounded-full bg-card/95 shadow-sm pointer-coarse:min-h-7", triggerClassName),
    "aria-label": "Item actions",
  };

  if (!menuMounted && standInUsed == null) {
    return (
      <Button
        {...triggerProps}
        aria-haspopup="menu"
        onFocus={() => setStandInUsed("focus")}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setStandInUsed("open");
          onOpenChange?.(true);
        }}
      >
        <MoreHorizontal className="size-4" />
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu
        open={open}
        defaultOpen={standInUsed === "open"}
        onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
      >
        <DropdownMenuTrigger
          render={
            <Button
              {...triggerProps}
              // The stand-in had focus; the real trigger takes it over.
              autoFocus={standInUsed === "focus"}
              disabled={busy || deleteBusy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">{title}</DropdownMenuLabel>
            {onOpenMarkDone && !inbox ? (
              <DropdownMenuItem onClick={() => onOpenMarkDone(item)}>
                <CheckCircle2 className="size-4" />
                {item.status === "done" ? "Edit verdict" : `Mark ${doneVerb(item.category)}`}
              </DropdownMenuItem>
            ) : null}
            {canPin ? (
              <DropdownMenuItem disabled={busy} onClick={() => void togglePin()}>
                {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                {pinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
            ) : null}
            {originalUrl ? (
              <DropdownMenuItem render={<a href={originalUrl} target="_blank" rel="noopener noreferrer" />}>
                <ExternalLink className="size-4" />
                Open original
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {inbox ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Inbox</DropdownMenuLabel>
              <DropdownMenuItem disabled={busy} onClick={() => void applyPatch({ status: "want" })}>
                Keep · Want
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Wrong type…</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-48 overflow-y-auto">
                  {CATEGORIES.map((c) => (
                    <DropdownMenuItem
                      key={c}
                      disabled={busy}
                      className={item.category === c ? "font-semibold text-accent-foreground" : undefined}
                      onClick={() => void applyPatch({ category: c, status: "want" })}
                    >
                      {formatCategory(c)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem disabled={busy} onClick={() => void applyPatch({ status: "dismissed" })}>
                Dismiss
              </DropdownMenuItem>
            </DropdownMenuGroup>
          ) : (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Change status</DropdownMenuLabel>
              {STATUS_ACTIONS.map((status) => (
                <DropdownMenuItem
                  key={status}
                  disabled={busy || item.status === status}
                  className={item.status === status ? "font-semibold text-accent-foreground" : undefined}
                  onClick={() => void applyPatch({ status })}
                >
                  {formatStatus(status)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setDeleteError(null);
              setDeleteUsed(true);
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="size-4" />
            Delete item
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {deleteUsed ? (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete item?</DialogTitle>
              <DialogDescription>
                Delete &quot;{title}&quot; permanently from your library. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={deleteBusy} onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" disabled={deleteBusy} onClick={() => void deleteItem()}>
                {deleteBusy ? "Deleting..." : "Delete item"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

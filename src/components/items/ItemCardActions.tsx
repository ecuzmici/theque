"use client";

import { CheckCircle2, ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
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

/** Quick actions for one card: mark done, open original, status or inbox triage, delete. */
export function ItemCardActions({
  item,
  shelfId,
  onItemPatch,
  onOpenMarkDone,
  open,
  onOpenChange,
  triggerClassName,
}: ItemCardActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const originalUrl = useMemo(() => safeHttpUrl(item.canonical_url), [item.canonical_url]);
  const title = cardTitle(item);
  const inbox = item.status === "inbox";

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

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className={cn(
                "rounded-full bg-card/90 shadow-sm backdrop-blur pointer-coarse:min-h-7",
                triggerClassName,
              )}
              disabled={busy || deleteBusy}
              aria-label="Item actions"
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
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="size-4" />
            Delete item
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
    </>
  );
}

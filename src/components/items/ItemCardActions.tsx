"use client";

import { ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import { formatStatus } from "@/lib/item-labels";
import { itemMatchesShelf } from "@/lib/shelf-filter";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";

const STATUS_ACTIONS: ItemStatus[] = ["want", "dismissed"];

type ItemCardActionsProps = {
  item: LibraryItemRow;
  shelfId: ShelfId;
  onItemPatch?: (
    itemId: string,
    patch: Partial<LibraryItemRow> & { status?: ItemStatus; category?: ItemCategory | null },
    opts?: { remove?: boolean },
  ) => void;
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

export function ItemCardActions({ item, shelfId, onItemPatch }: ItemCardActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const originalUrl = useMemo(() => safeHttpUrl(item.canonical_url), [item.canonical_url]);
  const title = item.title ?? item.domain;

  const applyStatus = useCallback(
    async (status: ItemStatus) => {
      const patch = { status };
      onItemPatch?.(item.id, patch, {
        remove: !itemMatchesShelf({ ...item, ...patch }, shelfId),
      });
      setBusy(true);
      try {
        const res = await fetch(`/api/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) router.refresh();
      } finally {
        setBusy(false);
      }
    },
    [item, onItemPatch, router, shelfId],
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
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="xs"
              variant="secondary"
              className="h-11 min-h-11 w-[3.125rem] min-w-[3.125rem] rounded-full gap-1 bg-card/95 px-3 shadow-sm backdrop-blur lg-fine:h-7 lg-fine:min-h-7 lg-fine:w-auto lg-fine:min-w-0 lg-fine:rounded-[min(var(--radius-md),10px)]"
              disabled={busy || deleteBusy}
              aria-label="Item actions"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          }
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Item</DropdownMenuLabel>
            {originalUrl ? (
              <DropdownMenuItem render={<a href={originalUrl} target="_blank" rel="noopener noreferrer" />}>
                <ExternalLink className="size-4" />
                Open original
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Change status</DropdownMenuLabel>
            {STATUS_ACTIONS.map((status) => (
              <DropdownMenuItem
                key={status}
                disabled={busy || item.status === status}
                className={item.status === status ? "font-semibold text-accent-foreground" : undefined}
                onClick={() => void applyStatus(status)}
              >
                {formatStatus(status)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
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

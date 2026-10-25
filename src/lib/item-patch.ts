import type { Dispatch, SetStateAction } from "react";

import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import type { LibraryItemRow } from "@/lib/types/library-item";

export type ItemPatch = Partial<LibraryItemRow> & {
  status?: ItemStatus;
  category?: ItemCategory | null;
};

export type ItemPatchOptions = { remove?: boolean };

/** Applies an optimistic patch. The returned function undoes it. */
export type ItemPatchHandler = (
  itemId: string,
  patch: ItemPatch,
  opts?: ItemPatchOptions,
) => (() => void) | void;

/**
 * Applies an optimistic patch to a list in state and returns its undo. The
 * undo puts the previous row back, at its old position if the patch removed it.
 */
export function applyItemPatch(
  setItems: Dispatch<SetStateAction<LibraryItemRow[]>>,
  itemId: string,
  patch: ItemPatch,
  opts?: ItemPatchOptions,
): () => void {
  // The server clears the pin of a done or dismissed item. Do the same here.
  if ((patch.status === "done" || patch.status === "dismissed") && !("pinned_at" in patch)) {
    patch = { ...patch, pinned_at: null };
  }
  let before: LibraryItemRow | undefined;
  let index = -1;
  setItems((prev) => {
    index = prev.findIndex((i) => i.id === itemId);
    before = prev[index];
    if (opts?.remove) return prev.filter((i) => i.id !== itemId);
    return prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
  });
  return () => {
    const row = before;
    if (!row) return;
    setItems((prev) => {
      const at = prev.findIndex((i) => i.id === itemId);
      const next = [...prev];
      if (at >= 0) next[at] = row;
      else next.splice(Math.min(Math.max(index, 0), next.length), 0, row);
      return next;
    });
  };
}

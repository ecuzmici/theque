"use client";

import { useEffect, useRef } from "react";

import { itemMatchesShelf } from "@/lib/shelf-filter";
import type { ShelfId } from "@/lib/shelves";
import { libraryItemFromRow, type LibraryItemRow } from "@/lib/types/library-item";
import type { ItemDetailResponseBody } from "@/lib/types/api";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Realtime UPDATE events on `items` for shelf-membership
 * decisions only — `status`/`category` on the payload row are plaintext and
 * safe to read directly. `note`/`verdict` are ciphertext on the wire
 * (ADR 0013), so they are never taken from a realtime payload: when a
 * currently-displayed item's content changes, the fresh row is refetched via
 * the decrypting `GET /api/items/[id]` endpoint instead. Realtime never
 * introduces a new card into the grid — only the paginated fetch does that —
 * it can only update or remove one that is already displayed.
 */
export function useItemRealtime(
  userId: string | null,
  shelfId: ShelfId,
  items: LibraryItemRow[],
  setItems: React.Dispatch<React.SetStateAction<LibraryItemRow[]>>,
) {
  // Read via a ref (not a `useEffect` dependency) so the subscription below
  // doesn't get torn down and recreated every time the item list changes.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    try {
      const channel = supabase
        .channel(`items:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "items",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as Pick<LibraryItemRow, "id" | "status" | "category">;
            const wasDisplayed = itemsRef.current.some((i) => i.id === row.id);
            const matches = itemMatchesShelf(row, shelfId);

            if (!matches) {
              if (wasDisplayed) {
                setItems((prev) => prev.filter((i) => i.id !== row.id));
              }
              return;
            }

            if (!wasDisplayed) return;

            // Still displayed and still belongs on this shelf — its content
            // (title, status, verdict, ...) may have changed. Refetch through
            // the decrypting single-item endpoint rather than merging the raw
            // payload, which carries ciphertext note/verdict.
            void fetch(`/api/items/${row.id}`)
              .then((res) => (res.ok ? (res.json() as Promise<ItemDetailResponseBody>) : null))
              .then((full) => {
                if (!full) return;
                const patch = libraryItemFromRow(full);
                setItems((prev) => {
                  const idx = prev.findIndex((i) => i.id === row.id);
                  if (idx === -1) return prev;
                  const next = [...prev];
                  next[idx] = { ...next[idx], ...patch };
                  return next;
                });
              })
              .catch(() => {
                // Best-effort; the next realtime event or poll can retry.
              });
          },
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      // Realtime is progressive enhancement; the library still loads through REST.
    }
  }, [userId, shelfId, setItems]);
}

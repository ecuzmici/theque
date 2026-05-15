"use client";

import { useEffect } from "react";

import { itemMatchesShelf } from "@/lib/shelf-filter";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";
import { createClient } from "@/lib/supabase/client";

export function useItemRealtime(
  userId: string | null,
  shelfId: ShelfId,
  setItems: React.Dispatch<React.SetStateAction<LibraryItemRow[]>>,
) {
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
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
          const row = payload.new as LibraryItemRow;
          setItems((prev) => {
            const idx = prev.findIndex((i) => i.id === row.id);
            const matches = itemMatchesShelf(row, shelfId);
            if (!matches) {
              if (idx === -1) return prev;
              return prev.filter((i) => i.id !== row.id);
            }
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], ...row };
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, shelfId, setItems]);
}

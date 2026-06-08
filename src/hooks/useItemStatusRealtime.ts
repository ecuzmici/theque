"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

type AnyRow = Record<string, unknown>;

/**
 * Subscribes to Realtime UPDATE events for a single item row.
 * Calls onUpdate with the new row payload whenever the row changes.
 * Progressive enhancement — item detail still works via REST if the socket fails.
 */
export function useItemStatusRealtime(
  itemId: string,
  userId: string,
  onUpdate: (row: AnyRow) => void,
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!itemId || !userId) return;

    const supabase = createClient();
    try {
      const channel = supabase
        .channel(`item-detail:${itemId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "items",
            filter: `id=eq.${itemId}`,
          },
          (payload) => {
            onUpdateRef.current(payload.new as AnyRow);
          },
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      // Realtime is progressive enhancement; item detail still works via REST fallback.
    }
  }, [itemId, userId]);
}

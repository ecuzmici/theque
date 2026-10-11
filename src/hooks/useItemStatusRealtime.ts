"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";
import { subscribeWithSession } from "@/lib/supabase/realtime-subscribe";
import type { ItemDetailResponseBody } from "@/lib/types/api";

/**
 * Subscribes to Realtime UPDATE events for a single item row.
 * `note` and `verdict` are ciphertext on the wire (ADR 0013), so the event
 * payload never reaches `onUpdate`. The event only triggers a fetch of the
 * decrypting `GET /api/items/[id]` endpoint, and `onUpdate` receives that row.
 * Progressive enhancement: item detail still works via REST if the socket fails.
 */
export function useItemStatusRealtime(
  itemId: string,
  userId: string,
  onUpdate: (row: ItemDetailResponseBody) => void,
) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!itemId || !userId) return;

    const supabase = createClient();
    return subscribeWithSession(supabase, () =>
      supabase
        .channel(`item-detail:${itemId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "items",
            // Filter on `user_id`, like `useItemRealtime`, and match the
            // plaintext row id here.
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if ((payload.new as { id?: string } | null)?.id !== itemId) return;
            void fetch(`/api/items/${itemId}`)
              .then((res) => (res.ok ? (res.json() as Promise<ItemDetailResponseBody>) : null))
              .then((full) => {
                if (full) onUpdateRef.current(full);
              })
              .catch(() => {
                // Best-effort; the next realtime event can retry.
              });
          },
        )
        .subscribe(),
    );
  }, [itemId, userId]);
}

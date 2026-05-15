"use client";

import { useEffect, useState } from "react";

import type { ItemsListResponseBody, ItemSummaryPayload } from "@/lib/types/api";

const DEBOUNCE_MS = 320;

/** Debounced GET /api/items?q= for the Search screen. */
export function useDebouncedItemSearch(query: string) {
  const [items, setItems] = useState<ItemSummaryPayload[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    const handle = window.setTimeout(async () => {
      if (!q) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/items?q=${encodeURIComponent(q)}&limit=48`);
        if (!res.ok) {
          setItems([]);
          return;
        }
        const body = (await res.json()) as ItemsListResponseBody;
        setItems(body.items);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [query]);

  return { items, loading };
}

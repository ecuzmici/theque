"use client";

import { useEffect, useState } from "react";

import type { ItemsListResponseBody, ItemSummaryPayload } from "@/lib/types/api";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";

const DEBOUNCE_MS = 320;

export type ItemSearchFilters = {
  q: string;
  category?: ItemCategory | "";
  status?: ItemStatus | "";
};

function buildSearchUrl(filters: ItemSearchFilters): string | null {
  const q = filters.q.trim();
  if (!q && !filters.category && !filters.status) {
    return null;
  }
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filters.category) params.set("category", filters.category);
  if (filters.status) params.set("status", filters.status);
  params.set("limit", "48");
  return `/api/items?${params.toString()}`;
}

/** Debounced GET /api/items with optional filters for Search. */
export function useDebouncedItemSearch(filters: ItemSearchFilters) {
  const [items, setItems] = useState<ItemSummaryPayload[]>([]);
  const [loading, setLoading] = useState(false);
  const url = buildSearchUrl(filters);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (!url) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(url);
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
  }, [url]);

  return { items, loading, hasQuery: url != null };
}

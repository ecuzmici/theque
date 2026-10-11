"use client";

import { useEffect, useState } from "react";

import type { ItemsListResponseBody, ItemSummaryPayload } from "@/lib/types/api";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";

const DEBOUNCE_MS = 320;

export type ItemSearchFilters = {
  q: string;
  /** One value or a list; a list goes to the API as CSV. */
  category?: ItemCategory | ItemCategory[] | "";
  status?: ItemStatus | ItemStatus[] | "";
  limit?: number;
};

function toCsv(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(",") : (value ?? "");
}

function buildSearchUrl(filters: ItemSearchFilters): string | null {
  const q = filters.q.trim();
  const category = toCsv(filters.category);
  const status = toCsv(filters.status);
  if (!q && !category && !status) {
    return null;
  }
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (status) params.set("status", status);
  params.set("limit", String(filters.limit ?? 48));
  return `/api/items?${params.toString()}`;
}

/** Debounced GET /api/items with optional filters for library search. */
export function useDebouncedItemSearch(filters: ItemSearchFilters) {
  const [items, setItems] = useState<ItemSummaryPayload[]>([]);
  // The URL whose request finished last. Until it matches `url`, the search is loading,
  // so the debounce wait counts as loading too.
  const [settledUrl, setSettledUrl] = useState<string | null>(null);
  const url = buildSearchUrl(filters);

  useEffect(() => {
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      if (!url) {
        setItems([]);
        setSettledUrl(null);
        return;
      }
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          setItems([]);
          return;
        }
        const body = (await res.json()) as ItemsListResponseBody;
        setItems(body.items);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setItems([]);
      } finally {
        if (!controller.signal.aborted) setSettledUrl(url);
      }
    }, url ? DEBOUNCE_MS : 0);

    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [url]);

  return { items, loading: url != null && url !== settledUrl, hasQuery: url != null };
}

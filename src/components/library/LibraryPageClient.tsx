"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ItemGridSkeleton } from "@/components/items/ItemCardSkeleton";
import { LibraryInsights } from "@/components/library/LibraryInsights";
import { LibraryItemsSection } from "@/components/library/LibraryItemsSection";
import { ShelfTabs } from "@/components/library/ShelfTabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { RecommendButton } from "@/components/recommend/RecommendButton";
import { Button } from "@/components/ui/button";
import { fetchLibraryItemsForShelf } from "@/lib/library-items-for-shelf";
import { SHELVES, parseShelfParam, type ShelfId } from "@/lib/shelves";
import { createClient } from "@/lib/supabase/client";
import type { LibraryItemRow } from "@/lib/types/library-item";

type ShelfCache = {
  items: LibraryItemRow[];
  hasMore: boolean;
};

type LibraryPageClientProps = {
  userId: string;
  /** Passed from the server page to avoid exposing secret env vars to the client. */
  recommendBooksEnabled?: boolean;
  recommendWatchEnabled?: boolean;
};

export function LibraryPageClient({
  userId,
  recommendBooksEnabled = false,
  recommendWatchEnabled = false,
}: LibraryPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlShelf = parseShelfParam(searchParams.get("shelf"));
  const [pendingShelf, setPendingShelf] = useState<ShelfId | null>(null);
  const activeShelf = pendingShelf ?? urlShelf;

  const [itemsCache, setItemsCache] = useState<Partial<Record<ShelfId, ShelfCache>>>({});
  const itemsCacheRef = useRef(itemsCache);
  useEffect(() => {
    itemsCacheRef.current = itemsCache;
  }, [itemsCache]);

  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (pendingShelf == null || pendingShelf !== urlShelf) return;
    const id = requestAnimationFrame(() => setPendingShelf(null));
    return () => cancelAnimationFrame(id);
  }, [pendingShelf, urlShelf]);

  const selectShelf = useCallback(
    (id: ShelfId) => {
      setPendingShelf(id);
      const href = id === "all" ? "/library" : `/library?shelf=${id}`;
      router.replace(href, { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    if (itemsCacheRef.current[activeShelf] !== undefined) return;

    let cancelled = false;
    const supabase = createClient();
    const targetShelf = activeShelf;

    void (async () => {
      setLoadError(null);
      try {
        const result = await fetchLibraryItemsForShelf(supabase, targetShelf);
        if (cancelled) return;
        setItemsCache((prev) => ({ ...prev, [targetShelf]: result }));
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Could not load items");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeShelf]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const { count, error } = await supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("status", "inbox");
      if (cancelled || error) return;
      setInboxCount(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeShelf]);

  const cachedShelf = itemsCache[activeShelf];
  const cachedItems = cachedShelf?.items;
  const cachedHasMore = cachedShelf?.hasMore ?? false;
  const isLoadingShelf = cachedShelf === undefined && loadError == null;
  const activeLabel = SHELVES.find((s) => s.id === activeShelf)?.label ?? "All";
  const updateActiveShelfItems = useCallback(
    (items: LibraryItemRow[]) => {
      setItemsCache((prev) => {
        const existing = prev[activeShelf];
        return { ...prev, [activeShelf]: { items, hasMore: existing?.hasMore ?? false } };
      });
    },
    [activeShelf],
  );

  return (
    <div>
      <PageHeader
        title="Library"
        description="Browse your taste by shelf."
      />

      <LibraryInsights />

      {inboxCount != null && inboxCount > 0 && activeShelf !== "inbox" ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <p className="text-sm text-foreground">
            <span className="font-semibold tabular-nums">{inboxCount}</span>{" "}
            {inboxCount === 1 ? "item needs" : "items need"} triage in Inbox
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => selectShelf("inbox")}
          >
            Open Inbox
          </Button>
        </div>
      ) : null}

      <ShelfTabs activeShelf={activeShelf} inboxCount={inboxCount} onSelect={selectShelf} />

      <p className="sr-only" aria-live="polite">
        Showing {activeLabel} shelf
      </p>

      {/* AI Recommendations button — shown on books/watch shelves when feature is enabled */}
      {((activeShelf === "books" && recommendBooksEnabled) ||
        (activeShelf === "watch" && recommendWatchEnabled)) &&
      cachedItems !== undefined ? (
        <div className="mb-4 flex justify-end">
          <RecommendButton
            shelfId={activeShelf as "books" | "watch"}
            shelfItems={cachedItems}
          />
        </div>
      ) : null}

      {loadError != null && cachedItems === undefined ? (
        <div className="rounded-xl border border-border bg-muted/40 px-6 py-10 text-center text-sm text-muted-foreground">
          {loadError}
        </div>
      ) : isLoadingShelf ? (
        <ItemGridSkeleton />
      ) : (
        <LibraryItemsSection
          key={activeShelf}
          userId={userId}
          shelfId={activeShelf}
          initialItems={cachedItems ?? []}
          initialHasMore={cachedHasMore}
          onItemsChange={updateActiveShelfItems}
        />
      )}
    </div>
  );
}

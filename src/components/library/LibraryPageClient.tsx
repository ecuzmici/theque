"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Eye, EyeOff, Layers } from "lucide-react";

import { InboxTriageStack } from "@/components/inbox/InboxTriageStack";
import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { COVER_GRID_CLASS } from "@/components/items/ItemGrid";
import { LibraryItemsSection } from "@/components/library/LibraryItemsSection";
import { LibrarySearchResults } from "@/components/library/LibrarySearchResults";
import { LibrarySearchRow } from "@/components/library/LibrarySearchRow";
import { ShelfChips } from "@/components/library/ShelfChips";
import { TasteChipRow } from "@/components/library/TasteChipRow";
import { UpNextRow } from "@/components/library/UpNextRow";
import { useLibrarySearch } from "@/components/library/useLibrarySearch";
import { libraryCacheKey, useTasteFilter } from "@/components/library/useTasteFilter";
import { Button } from "@/components/ui/button";
import { fetchLibraryItemsPage } from "@/lib/library-items-client";
import { libraryHref, shelfFixesStatus } from "@/lib/library-search";
import { itemMatchesShelf } from "@/lib/shelf-filter";
import {
  SHELVES,
  parseShelfParam,
  resolveRequestedShelf,
  visibleShelves,
  type ShelfId,
} from "@/lib/shelves";
import { createClient } from "@/lib/supabase/client";
import { tasteShelfCategory } from "@/lib/taste/taste-lists";
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

function LibraryGridSkeleton() {
  return (
    <ul className={COVER_GRID_CLASS}>
      {Array.from({ length: 10 }, (_, i) => (
        <li key={i}>
          <ItemCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

export function LibraryPageClient({
  userId,
  recommendBooksEnabled = false,
  recommendWatchEnabled = false,
}: LibraryPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlShelf = parseShelfParam(searchParams.get("shelf"));
  const [pendingShelf, setPendingShelf] = useState<ShelfId | null>(null);
  const search = useLibrarySearch();

  // The cache key is the shelf id, plus the genre and mood when a chip is active.
  // A filtered list never shares a key with the full shelf.
  const [itemsCache, setItemsCache] = useState<Partial<Record<string, ShelfCache>>>({});
  const itemsCacheRef = useRef(itemsCache);
  useEffect(() => {
    itemsCacheRef.current = itemsCache;
  }, [itemsCache]);

  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [otherCount, setOtherCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const [hideDone, setHideDone] = useState(false);
  const [triageMode, setTriageMode] = useState(false);

  // Only Other and Inbox are dynamic; both hide when empty. Prefer the live
  // count from a shelf's already-loaded items (so consuming its last item hides
  // the tab and falls the view back to All on the next render), and fall back to
  // the lightweight count query when that shelf has not been loaded yet.
  const liveOtherCount = itemsCache.other
    ? itemsCache.other.items.filter((i) => itemMatchesShelf(i, "other")).length
    : null;
  const liveInboxCount = itemsCache.inbox
    ? itemsCache.inbox.items.filter((i) => itemMatchesShelf(i, "inbox")).length
    : null;
  const visibleShelfIds = visibleShelves({
    other: liveOtherCount ?? otherCount ?? 0,
    inbox: liveInboxCount ?? inboxCount ?? 0,
  });
  const activeShelf = resolveRequestedShelf(pendingShelf ?? urlShelf, visibleShelfIds);
  const taste = useTasteFilter(activeShelf);
  const cacheKey = libraryCacheKey(activeShelf, taste);

  // Leaving the inbox shelf always exits triage.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leaving the inbox ends triage
    if (activeShelf !== "inbox") setTriageMode(false);
  }, [activeShelf]);
  const prefsLoaded = useRef(false);

  // Presentation prefs survive reloads; read post-mount to keep hydration clean.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is read after mount so hydration stays clean
    setHideDone(window.localStorage.getItem("theque_hide_done") === "1");
    prefsLoaded.current = true;
  }, []);

  // "Hide done" is a client-side display filter (see LibraryItemsSection), so
  // toggling it never refetches — it just re-renders the cached shelf.
  useEffect(() => {
    if (!prefsLoaded.current) return;
    window.localStorage.setItem("theque_hide_done", hideDone ? "1" : "0");
  }, [hideDone]);

  useEffect(() => {
    if (pendingShelf == null || pendingShelf !== urlShelf) return;
    const id = requestAnimationFrame(() => setPendingShelf(null));
    return () => cancelAnimationFrame(id);
  }, [pendingShelf, urlShelf]);

  const selectShelf = useCallback(
    (id: ShelfId) => {
      setPendingShelf(id);
      router.replace(libraryHref(id, search.query), { scroll: false });
    },
    [router, search.query],
  );

  const tasteGenre = taste.genre;
  const tasteMood = taste.mood;
  useEffect(() => {
    if (itemsCacheRef.current[cacheKey] !== undefined) return;

    let cancelled = false;
    const targetShelf = activeShelf;

    void (async () => {
      setLoadError((prev) => (prev?.key === cacheKey ? null : prev));
      try {
        const result = await fetchLibraryItemsPage(targetShelf, 0, "recent", {
          genre: tasteGenre,
          mood: tasteMood,
        });
        if (cancelled) return;
        setItemsCache((prev) => ({ ...prev, [cacheKey]: result }));
      } catch (e) {
        if (cancelled) return;
        setLoadError({
          key: cacheKey,
          message: e instanceof Error ? e.message : "Could not load items",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeShelf, cacheKey, tasteGenre, tasteMood]);

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

  // Lightweight count for the grouped Other shelf (its categories, minus the
  // done/dismissed statuses excluded by `itemMatchesShelf(item, "other")`), so
  // its tab can appear even before the shelf itself has been loaded.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const { count, error } = await supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .in("category", ["restaurants", "products", "travel", "recipes"])
        .not("status", "in", "(done,dismissed)");
      if (cancelled || error) return;
      setOtherCount(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeShelf]);

  const cachedShelf = itemsCache[cacheKey];
  const cachedItems = cachedShelf?.items;
  const cachedHasMore = cachedShelf?.hasMore ?? false;
  const activeLoadError = loadError?.key === cacheKey ? loadError.message : null;
  const isLoadingShelf = cachedShelf === undefined && activeLoadError == null;
  const activeLabel = SHELVES.find((s) => s.id === activeShelf)?.label ?? "All";
  // LibraryItemsSection needs a stable setter per cache key, so the useCallback stays.
  const updateActiveShelfItems = useCallback(
    (items: LibraryItemRow[]) => {
      setItemsCache((prev) => {
        const existing = prev[cacheKey];
        return { ...prev, [cacheKey]: { items, hasMore: existing?.hasMore ?? false } };
      });
    },
    [cacheKey],
  );

  const tasteCategory = tasteShelfCategory(activeShelf);

  return (
    <div>
      <h1 className="sr-only">Library</h1>

      {/* The Up next row sits above the shelf chips on every shelf and does not
          change with the active shelf. See docs/adr/0019, decision 1. */}
      <UpNextRow
        recommendBooksEnabled={recommendBooksEnabled}
        recommendWatchEnabled={recommendWatchEnabled}
      />

      <LibrarySearchRow
        value={search.draft}
        onChange={search.setDraft}
        onClear={search.clear}
        shelfLabel={activeShelf === "all" ? null : activeLabel}
        showStatus={search.active && !shelfFixesStatus(activeShelf)}
        status={search.status}
        onStatusChange={search.setStatus}
        filters={
          taste.enabled && tasteCategory ? (
            <TasteChipRow
              category={tasteCategory}
              facets={taste.facets}
              loading={taste.facetsLoading}
              genre={taste.genre}
              mood={taste.mood}
              onGenreChange={taste.setGenre}
              onMoodChange={taste.setMood}
            />
          ) : null
        }
      >
        <ShelfChips
          shelves={visibleShelfIds}
          active={activeShelf}
          onSelect={selectShelf}
          inboxCount={inboxCount}
        />
      </LibrarySearchRow>

      <p className="sr-only" aria-live="polite">
        Showing {activeLabel} shelf
      </p>

      {/* Shelf toolbar: inbox triage, hide done */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {activeShelf !== "inbox" ? (
          <span />
        ) : (
          <Button
            type="button"
            variant={triageMode ? "secondary" : "outline"}
            size="sm"
            className="min-h-11 gap-1.5 lg-fine:min-h-9"
            aria-pressed={triageMode}
            onClick={() => setTriageMode((t) => !t)}
          >
            <Layers className="size-4" aria-hidden />
            {triageMode ? "Grid view" : "Swipe to triage"}
          </Button>
        )}
        <div className="flex items-center gap-2">
          {activeShelf !== "inbox" ? (
            <Button
              type="button"
              variant={hideDone ? "secondary" : "outline"}
              size="sm"
              aria-pressed={hideDone}
              className="min-h-11 gap-1.5 lg-fine:min-h-9"
              onClick={() => setHideDone((v) => !v)}
            >
              {hideDone ? (
                <Eye className="size-4" aria-hidden />
              ) : (
                <EyeOff className="size-4" aria-hidden />
              )}
              {hideDone ? "Show done" : "Hide done"}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Keyed by shelf so a shelf swap replays a soft fade; the triage
          toggle keeps `activeShelf` stable, so it does not re-animate.
          Reduced-motion users get no animation (see `.ks-shelf-enter`). */}
      {search.active ? (
        <LibrarySearchResults
          query={search.query}
          shelfId={activeShelf}
          status={search.status}
          genre={taste.genre}
          mood={taste.mood}
          onClearFilter={taste.clear}
        />
      ) : (
      <div key={activeShelf} className="ks-shelf-enter">
      {activeLoadError != null && cachedItems === undefined ? (
        <div className="rounded-xl border border-border bg-muted/40 px-6 py-10 text-center text-sm text-muted-foreground">
          {activeLoadError}
        </div>
      ) : isLoadingShelf ? (
        <LibraryGridSkeleton />
      ) : activeShelf === "inbox" && triageMode ? (
        <InboxTriageStack
          items={cachedItems ?? []}
          onResolve={(itemId, patch, opts) => {
            const existing = itemsCacheRef.current.inbox;
            if (!existing) return;
            let items: LibraryItemRow[];
            if (opts?.remove) {
              items = existing.items.filter((i) => i.id !== itemId);
            } else if (opts?.restoreItem) {
              const restored = { ...opts.restoreItem, ...patch };
              items = existing.items.some((i) => i.id === itemId)
                ? existing.items.map((i) => (i.id === itemId ? restored : i))
                : [restored, ...existing.items];
            } else {
              items = existing.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
            }
            setItemsCache((prev) => ({ ...prev, inbox: { ...existing, items } }));
            setInboxCount((c) => {
              if (c == null) return c;
              if (opts?.remove) return Math.max(0, c - 1);
              if (opts?.restoreItem) return c + 1;
              return c;
            });
          }}
          onExit={() => setTriageMode(false)}
        />
      ) : (
        <LibraryItemsSection
          key={cacheKey}
          userId={userId}
          shelfId={activeShelf}
          genre={taste.genre}
          mood={taste.mood}
          onClearFilter={taste.clear}
          initialItems={cachedItems ?? []}
          initialHasMore={cachedHasMore}
          hideDone={hideDone}
          onItemsChange={updateActiveShelfItems}
        />
      )}
      </div>
      )}
    </div>
  );
}

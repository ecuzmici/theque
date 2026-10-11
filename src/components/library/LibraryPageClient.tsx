"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Eye, EyeOff, Images, Layers } from "lucide-react";

import { InboxTriageStack } from "@/components/inbox/InboxTriageStack";
import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { LibraryItemsSection } from "@/components/library/LibraryItemsSection";
import { LibrarySearchResults } from "@/components/library/LibrarySearchResults";
import { LibrarySearchRow } from "@/components/library/LibrarySearchRow";
import { ShelfChips } from "@/components/library/ShelfChips";
import { useLibrarySearch } from "@/components/library/useLibrarySearch";
import { LibrarySpineBand } from "@/components/library/LibrarySpineBand";
import { ShuffleButton } from "@/components/library/ShuffleButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { RecommendUnlockBanner } from "@/components/recommend/RecommendUnlockBanner";
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
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
      {Array.from({ length: 8 }, (_, i) => (
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

  const [itemsCache, setItemsCache] = useState<Partial<Record<ShelfId, ShelfCache>>>({});
  const itemsCacheRef = useRef(itemsCache);
  useEffect(() => {
    itemsCacheRef.current = itemsCache;
  }, [itemsCache]);

  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [otherCount, setOtherCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wall, setWall] = useState(false);
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

  // Leaving the inbox shelf always exits triage.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leaving the inbox ends triage
    if (activeShelf !== "inbox") setTriageMode(false);
  }, [activeShelf]);
  const prefsLoaded = useRef(false);

  // Presentation prefs survive reloads; read post-mount to keep hydration clean.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is read after mount so hydration stays clean
    setWall(window.localStorage.getItem("theque_wall_mode") === "1");
    setHideDone(window.localStorage.getItem("theque_hide_done") === "1");
    prefsLoaded.current = true;
  }, []);

  useEffect(() => {
    if (!prefsLoaded.current) return;
    window.localStorage.setItem("theque_wall_mode", wall ? "1" : "0");
  }, [wall]);

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

  useEffect(() => {
    if (itemsCacheRef.current[activeShelf] !== undefined) return;

    let cancelled = false;
    const targetShelf = activeShelf;

    void (async () => {
      setLoadError(null);
      try {
        const result = await fetchLibraryItemsPage(targetShelf, 0);
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

  const cachedShelf = itemsCache[activeShelf];
  const cachedItems = cachedShelf?.items;
  const cachedHasMore = cachedShelf?.hasMore ?? false;
  const isLoadingShelf = cachedShelf === undefined && loadError == null;
  const activeLabel = SHELVES.find((s) => s.id === activeShelf)?.label ?? "All";
  // The React Compiler cannot keep this memoization. LibraryItemsSection needs a stable
  // setter per shelf, so the manual useCallback stays.
  /* eslint-disable react-hooks/preserve-manual-memoization */
  const updateActiveShelfItems = useCallback(
    (items: LibraryItemRow[]) => {
      setItemsCache((prev) => {
        const existing = prev[activeShelf];
        return { ...prev, [activeShelf]: { items, hasMore: existing?.hasMore ?? false } };
      });
    },
    [activeShelf],
  );
  /* eslint-enable react-hooks/preserve-manual-memoization */

  return (
    <div>
      <PageHeader title="Library" />

      {/* Persistent masthead: the Spine Band (whole-library identity) and the
          shelf-aware "Made for you" banner render above the keyed grid on every
          shelf, so switching shelves never pops the top of the page. The band
          stays whole-library; the banner adapts its featured category to the
          active shelf. See docs/adr/0019-persistent-shelf-aware-library-header.md. */}
      <LibrarySpineBand />
      <RecommendUnlockBanner
        booksEnabled={recommendBooksEnabled}
        watchEnabled={recommendWatchEnabled}
        activeShelf={activeShelf}
        items={cachedItems ?? []}
      />

      <LibrarySearchRow
        value={search.draft}
        onChange={search.setDraft}
        onClear={search.clear}
        shelfLabel={activeShelf === "all" ? null : activeLabel}
        showStatus={search.active && !shelfFixesStatus(activeShelf)}
        status={search.status}
        onStatusChange={search.setStatus}
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

      {/* Shelf toolbar: shuffle pick, AI recommendations, wall mode */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {activeShelf !== "inbox" ? (
          <ShuffleButton key={activeShelf} shelfId={activeShelf} />
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
          {/* Recommend CTA lives in the persistent "Made for you" masthead banner
              above (shelf-aware), so the toolbar no longer duplicates it. */}
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
          <Button
            type="button"
            variant={wall ? "secondary" : "outline"}
            size="icon"
            aria-pressed={wall}
            aria-label="Toggle wall mode (covers only)"
            title="Wall mode (covers only)"
            className="min-h-11 min-w-11 lg-fine:min-h-9 lg-fine:min-w-9"
            onClick={() => setWall((w) => !w)}
          >
            <Images className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {/* Keyed by shelf so a shelf swap replays a soft fade; wall-mode and
          triage toggles keep `activeShelf` stable, so they don't re-animate.
          Reduced-motion users get no animation (see `.ks-shelf-enter`). */}
      {search.active ? (
        <LibrarySearchResults query={search.query} shelfId={activeShelf} status={search.status} />
      ) : (
      <div key={activeShelf} className="ks-shelf-enter">
      {loadError != null && cachedItems === undefined ? (
        <div className="rounded-xl border border-border bg-muted/40 px-6 py-10 text-center text-sm text-muted-foreground">
          {loadError}
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
          key={activeShelf}
          userId={userId}
          shelfId={activeShelf}
          initialItems={cachedItems ?? []}
          initialHasMore={cachedHasMore}
          wall={wall}
          hideDone={hideDone}
          onItemsChange={updateActiveShelfItems}
        />
      )}
      </div>
      )}
    </div>
  );
}

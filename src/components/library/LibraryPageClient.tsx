"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Images, Layers } from "lucide-react";

import { InboxTriageStack } from "@/components/inbox/InboxTriageStack";
import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { LibraryItemsSection } from "@/components/library/LibraryItemsSection";
import { LibrarySpineBand } from "@/components/library/LibrarySpineBand";
import { ShuffleButton } from "@/components/library/ShuffleButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { RecommendButton } from "@/components/recommend/RecommendButton";
import { RecommendUnlockBanner } from "@/components/recommend/RecommendUnlockBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { fetchLibraryItemsForShelf } from "@/lib/library-items-for-shelf";
import { itemMatchesShelf } from "@/lib/shelf-filter";
import {
  SHELVES,
  getShelf,
  parseShelfParam,
  resolveRequestedShelf,
  visibleShelves,
  type ShelfId,
} from "@/lib/shelves";
import { createClient } from "@/lib/supabase/client";
import type { LibraryItemRow } from "@/lib/types/library-item";
import { cn } from "@/lib/utils";

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

  const [itemsCache, setItemsCache] = useState<Partial<Record<ShelfId, ShelfCache>>>({});
  const itemsCacheRef = useRef(itemsCache);
  useEffect(() => {
    itemsCacheRef.current = itemsCache;
  }, [itemsCache]);

  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [otherCount, setOtherCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wall, setWall] = useState(false);
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
    if (activeShelf !== "inbox") setTriageMode(false);
  }, [activeShelf]);
  const prefsLoaded = useRef(false);

  // Presentation prefs survive reloads; read post-mount to keep hydration clean.
  useEffect(() => {
    setWall(window.localStorage.getItem("theque_wall_mode") === "1");
    prefsLoaded.current = true;
  }, []);

  useEffect(() => {
    if (!prefsLoaded.current) return;
    window.localStorage.setItem("theque_wall_mode", wall ? "1" : "0");
  }, [wall]);

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
        const result = await fetchLibraryItemsForShelf(supabase, targetShelf, 0);
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
      <PageHeader title="Library" />

      {/* Spine band (band + counts caption) is a whole-library identity element —
          landing shelf only, same gate as the "Made for you" banner below it. */}
      {activeShelf === "all" ? (
        <>
          <LibrarySpineBand />
          <RecommendUnlockBanner
            booksEnabled={recommendBooksEnabled}
            watchEnabled={recommendWatchEnabled}
            items={cachedItems ?? []}
          />
        </>
      ) : null}

      <ScrollArea className="w-full pb-4">
        {/* Rings are drawn outside the box and clip inside overflow:hidden viewports — use border for inactive tabs */}
        {/* WAI-ARIA tabs pattern: roving tabIndex + arrow key navigation */}
        <div
          className="flex w-max gap-2 px-0.5 py-1.5 pb-2"
          role="tablist"
          aria-label="Shelves"
          onKeyDown={(e) => {
            const tabs = visibleShelfIds;
            const currentIndex = tabs.indexOf(activeShelf);
            let nextIndex = currentIndex;
            if (e.key === "ArrowRight") {
              e.preventDefault();
              nextIndex = (currentIndex + 1) % tabs.length;
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            } else if (e.key === "Home") {
              e.preventDefault();
              nextIndex = 0;
            } else if (e.key === "End") {
              e.preventDefault();
              nextIndex = tabs.length - 1;
            } else {
              return;
            }
            const nextShelf = tabs[nextIndex];
            if (nextShelf) {
              selectShelf(nextShelf);
              // Move focus to the newly selected tab
              const tabEl = document.querySelector<HTMLButtonElement>(
                `[role="tab"][data-shelf-id="${nextShelf}"]`,
              );
              tabEl?.focus();
            }
          }}
        >
          {visibleShelfIds.map((id) => {
            const s = getShelf(id);
            const selected = s.id === activeShelf;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                data-shelf-id={s.id}
                onClick={() => selectShelf(s.id)}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  selected
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-muted text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                {s.label}
                {s.id === "inbox" && inboxCount != null && inboxCount > 0 ? (
                  <Badge
                    variant="secondary"
                    className="h-5 min-w-5 justify-center px-1.5 text-[10px]"
                  >
                    {inboxCount}
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" className="hidden" />
      </ScrollArea>

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
          {((activeShelf === "books" && recommendBooksEnabled) ||
            (activeShelf === "watch" && recommendWatchEnabled)) &&
          cachedItems !== undefined ? (
            <RecommendButton
              shelfId={activeShelf as "books" | "watch"}
              shelfItems={cachedItems}
            />
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
          onItemsChange={updateActiveShelfItems}
        />
      )}
      </div>
    </div>
  );
}

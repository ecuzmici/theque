"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { LibraryItemsSection } from "@/components/library/LibraryItemsSection";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { fetchLibraryItemsForShelf } from "@/lib/library-items-for-shelf";
import { SHELVES, parseShelfParam, type ShelfId } from "@/lib/shelves";
import { createClient } from "@/lib/supabase/client";
import type { LibraryItemRow } from "@/lib/types/library-item";
import { cn } from "@/lib/utils";

type LibraryPageClientProps = {
  userId: string;
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

export function LibraryPageClient({ userId }: LibraryPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlShelf = parseShelfParam(searchParams.get("shelf"));
  const [pendingShelf, setPendingShelf] = useState<ShelfId | null>(null);
  const activeShelf = pendingShelf ?? urlShelf;

  const [itemsCache, setItemsCache] = useState<Partial<Record<ShelfId, LibraryItemRow[]>>>({});
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
        const rows = await fetchLibraryItemsForShelf(supabase, targetShelf);
        if (cancelled) return;
        setItemsCache((prev) => ({ ...prev, [targetShelf]: rows }));
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

  const cachedItems = itemsCache[activeShelf];
  const isLoadingShelf = cachedItems === undefined && loadError == null;
  const activeLabel = SHELVES.find((s) => s.id === activeShelf)?.label ?? "All";

  return (
    <div>
      <PageHeader
        title="Library"
        description="Browse your taste by shelf — categories, not folders."
      />

      {inboxCount != null && inboxCount > 0 && activeShelf !== "inbox" ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-accent/50 px-4 py-3">
          <p className="text-sm text-foreground">
            <span className="font-semibold">{inboxCount}</span>{" "}
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

      <ScrollArea className="w-full pb-4">
        <div className="flex w-max gap-2 pb-1" role="tablist" aria-label="Shelves">
          {SHELVES.map((s) => {
            const selected = s.id === activeShelf;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectShelf(s.id)}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground ring-1 ring-border hover:bg-card hover:text-foreground",
                )}
              >
                {s.label}
                {s.id === "inbox" && inboxCount != null && inboxCount > 0 ? (
                  <Badge
                    variant={selected ? "secondary" : "default"}
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

      {loadError != null && cachedItems === undefined ? (
        <div className="rounded-xl border border-border bg-muted/40 px-6 py-10 text-center text-sm text-muted-foreground">
          {loadError}
        </div>
      ) : isLoadingShelf ? (
        <LibraryGridSkeleton />
      ) : (
        <LibraryItemsSection
          key={activeShelf}
          userId={userId}
          shelfId={activeShelf}
          initialItems={cachedItems ?? []}
        />
      )}
    </div>
  );
}

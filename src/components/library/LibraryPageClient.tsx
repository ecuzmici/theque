"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { LibraryItemsSection } from "@/components/library/LibraryItemsSection";
import { fetchLibraryItemsForShelf } from "@/lib/library-items-for-shelf";
import { SHELVES, parseShelfParam, type ShelfId } from "@/lib/shelves";
import { createClient } from "@/lib/supabase/client";
import type { LibraryItemRow } from "@/lib/types/library-item";

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
    if (itemsCacheRef.current[activeShelf] !== undefined) {
      return;
    }

    let cancelled = false;
    const supabase = createClient();
    const targetShelf = activeShelf;

    void (async () => {
      if (cancelled) return;
      setLoadError(null);
      try {
        const rows = await fetchLibraryItemsForShelf(supabase, targetShelf);
        if (cancelled) return;
        setItemsCache((prev) => ({ ...prev, [targetShelf]: rows }));
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Could not load items";
        setLoadError(message);
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

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-none" role="tablist" aria-label="Shelves">
        {SHELVES.map((s) => {
          const selected = s.id === activeShelf;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectShelf(s.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                selected
                  ? "bg-[color:var(--ks-fg)] text-[color:var(--ks-bg)] dark:bg-[color:var(--ks-accent-soft)] dark:text-[color:var(--ks-accent-hover)]"
                  : "bg-[color:var(--ks-bg-muted)] text-[color:var(--ks-fg-muted)] ring-1 ring-[color:var(--ks-border)] hover:bg-[color:var(--ks-surface)]"
              }`}
            >
              {s.label}
              {s.id === "inbox" && inboxCount != null && inboxCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-[color:var(--ks-accent)] px-2 py-0.5 text-[11px] font-semibold text-stone-950">
                  {inboxCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {loadError != null && cachedItems === undefined ? (
        <div className="rounded-[var(--ks-radius-card)] border border-[color:var(--ks-border)] bg-[color:var(--ks-bg-muted)]/40 px-6 py-10 text-center text-sm text-[color:var(--ks-fg-muted)]">
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "next-view-transitions";
import { Dices } from "lucide-react";

import { MadeForYouTile } from "@/components/library/MadeForYouTile";
import { Button } from "@/components/ui/button";
import { getDisplayImageUrl } from "@/lib/item-display";
import { fetchLibraryItemsPage } from "@/lib/library-items-client";
import type { LibraryItemRow } from "@/lib/types/library-item";
import { cn } from "@/lib/utils";

import { dayNumber, monthsWaiting, selectUpNext, type UpNextSource } from "./up-next";

const TILE_WIDTH = "w-24 shrink-0 snap-start lg:w-32";

async function loadShelf(shelf: "books" | "watch" | "forgotten"): Promise<LibraryItemRow[]> {
  try {
    return (await fetchLibraryItemsPage(shelf)).items;
  } catch {
    return [];
  }
}

function UpNextCover({ item, highlight }: { item: LibraryItemRow; highlight?: boolean }) {
  const src = getDisplayImageUrl(item.image_storage_path, item.image_url);
  return (
    <span
      className={cn(
        "relative block aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted shadow-sm",
        highlight && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
      style={item.dominant_color ? { backgroundColor: item.dominant_color } : undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy.
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center p-2 text-center font-serif text-xs text-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]">
          {item.title ?? item.domain}
        </span>
      )}
    </span>
  );
}

type Tile = { key: string; item: LibraryItemRow; eyebrow: string; highlight?: boolean };

/**
 * The Up next row at the top of /library: Tonight's pick, one forgotten item,
 * Next read, Next watch, and a "Made for you" tile. Shuffle draws a new
 * Tonight's pick from GET /api/items/random. See ADR 0019, decision 1.
 */
export function UpNextRow({
  recommendBooksEnabled = false,
  recommendWatchEnabled = false,
}: {
  recommendBooksEnabled?: boolean;
  recommendWatchEnabled?: boolean;
}) {
  const [source, setSource] = useState<UpNextSource | null>(null);
  const [shuffled, setShuffled] = useState<LibraryItemRow | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [books, watch, forgotten] = await Promise.all([
        loadShelf("books"),
        loadShelf("watch"),
        loadShelf("forgotten"),
      ]);
      if (!cancelled) setSource({ books, watch, forgotten });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const picks = useMemo(
    () => (source ? selectUpNext(source, { day: dayNumber(now), tonight: shuffled }) : null),
    [source, shuffled, now],
  );

  const tiles: Tile[] = [];
  if (picks?.tonight) {
    tiles.push({ key: "tonight", item: picks.tonight, eyebrow: "Tonight", highlight: true });
  }
  if (picks?.forgotten) {
    tiles.push({
      key: "forgotten",
      item: picks.forgotten,
      eyebrow: `${monthsWaiting(picks.forgotten.created_at, now)} mo waiting`,
    });
  }
  if (picks?.nextRead) tiles.push({ key: "read", item: picks.nextRead, eyebrow: "Next read" });
  if (picks?.nextWatch) tiles.push({ key: "watch", item: picks.nextWatch, eyebrow: "Next watch" });

  const recommendEnabled = recommendBooksEnabled || recommendWatchEnabled;
  const thumbs = tiles
    .map((t) => getDisplayImageUrl(t.item.image_storage_path, t.item.image_url))
    .filter((u): u is string => Boolean(u))
    .slice(0, 3);

  async function shuffle() {
    setShuffling(true);
    try {
      const res = await fetch("/api/items/random?shelf=all");
      if (!res.ok) return;
      const body = (await res.json()) as { item: LibraryItemRow | null };
      if (body.item) setShuffled(body.item);
    } catch {
      // A failed shuffle keeps the current pick.
    } finally {
      setShuffling(false);
    }
  }

  // Nothing to show: no wanted items and no recommendations.
  if (source && tiles.length === 0 && !recommendEnabled) return null;

  return (
    <section aria-labelledby="up-next-heading" className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="up-next-heading" className="font-heading text-xl tracking-tight">
          Up next
        </h2>
        {tiles.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={shuffling}
            onClick={() => void shuffle()}
            className="text-muted-foreground"
          >
            <Dices aria-hidden />
            {shuffling ? "Picking…" : "Shuffle"}
          </Button>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {shuffled ? `Tonight's pick: ${shuffled.title ?? shuffled.domain}` : ""}
      </p>
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] lg:mx-0 lg:scroll-px-1 lg:px-1">
        {source == null
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className={TILE_WIDTH} aria-hidden>
                <div className="aspect-[2/3] animate-pulse rounded-lg bg-muted" />
                <div className="mt-1.5 h-[15px] w-14 rounded bg-muted" />
                <div className="h-4 w-20 rounded bg-muted" />
              </li>
            ))
          : tiles.map(({ key, item, eyebrow, highlight }) => (
              <li key={key} className={TILE_WIDTH}>
                <Link
                  href={`/item/${item.id}`}
                  className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <UpNextCover item={item} highlight={highlight} />
                  <span
                    className={cn(
                      "mt-1.5 block text-[10px] font-semibold uppercase tracking-wider",
                      highlight ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {eyebrow}
                  </span>
                  <span className="line-clamp-1 text-xs font-medium">
                    {item.title ?? item.domain}
                  </span>
                </Link>
              </li>
            ))}
        {source != null && recommendEnabled ? (
          <li className={TILE_WIDTH}>
            <MadeForYouTile
              booksEnabled={recommendBooksEnabled}
              watchEnabled={recommendWatchEnabled}
              thumbs={thumbs}
            />
          </li>
        ) : null}
      </ul>
    </section>
  );
}

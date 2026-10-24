"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

import { CoverImg, type CoverUrls } from "@/components/items/CoverImg";
import { useRecommendationContext } from "@/components/recommend/RecommendationProvider";
import type { ItemCategory } from "@/lib/database.types";
import { RECOMMEND_MIN_ITEMS } from "@/lib/recommend/recommend-config";
import type { RecommendShelfId } from "@/lib/recommend/recommend-types";
import {
  effectiveUnlocked,
  persistUnlocked,
  readUnlocked,
} from "@/lib/recommend/unlock-storage";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { MadeForYouSheet } from "./MadeForYouSheet";
import { madeForYouEyebrow, type RecommendOption } from "./up-next";

type CategoryMeta = {
  shelfId: RecommendShelfId;
  category: ItemCategory;
};

const CATEGORIES: CategoryMeta[] = [
  { shelfId: "books", category: "books" },
  { shelfId: "watch", category: "movies_and_tv" },
];

/**
 * Counts the titled, not-done items per enabled category. A category unlocks at
 * RECOMMEND_MIN_ITEMS saves, and the unlock stays in localStorage after that.
 * Returns null while the counts load.
 */
function useRecommendOptions(booksEnabled: boolean, watchEnabled: boolean) {
  const enabled = useMemo(
    () => CATEGORIES.filter((c) => (c.shelfId === "books" ? booksEnabled : watchEnabled)),
    [booksEnabled, watchEnabled],
  );
  const [options, setOptions] = useState<RecommendOption[] | null>(null);

  useEffect(() => {
    if (enabled.length === 0) return;
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const rows = await Promise.all(
        enabled.map(async (c) => {
          const { count } = await supabase
            .from("items")
            .select("id", { count: "exact", head: true })
            .eq("category", c.category)
            .not("status", "in", "(done,dismissed)")
            .not("title", "is", null)
            .neq("title", "");
          const saved = count ?? 0;
          if (saved >= RECOMMEND_MIN_ITEMS) persistUnlocked(c.shelfId);
          return {
            shelfId: c.shelfId,
            saved,
            ready: effectiveUnlocked(saved, readUnlocked(c.shelfId), RECOMMEND_MIN_ITEMS),
          };
        }),
      );
      if (!cancelled) setOptions(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return options;
}

const TILE_CLASS =
  "block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * The "Made for you" tile at the end of the Up next row. A tap opens the
 * pre-run sheet (MadeForYouSheet). The sheet starts the recommendation run,
 * and the deck opens from the provider (see RecommendationProvider). Render it
 * only when at least one recommendation category is enabled.
 */
export function MadeForYouTile({
  booksEnabled,
  watchEnabled,
  thumbs,
}: {
  booksEnabled: boolean;
  watchEnabled: boolean;
  /** Up to 3 covers for the decorative stack. */
  thumbs: CoverUrls[];
}) {
  const { start } = useRecommendationContext();
  const options = useRecommendOptions(booksEnabled, watchEnabled);
  const [sheetOpen, setSheetOpen] = useState(false);

  const face = (
    <>
      <span className="relative flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed border-border bg-muted/50">
        {thumbs.length > 0 ? (
          <span className="flex -space-x-4" aria-hidden>
            {thumbs.slice(0, 3).map((urls, i) => (
              <CoverImg
                key={urls.src}
                urls={urls}
                className={cn(
                  "aspect-[2/3] w-8 rounded object-cover shadow-sm ring-1 ring-background",
                  i === 0 && "-rotate-[10deg]",
                  i === 1 && "-rotate-[4deg]",
                  i === 2 && "rotate-[6deg]",
                )}
              />
            ))}
          </span>
        ) : null}
        <Sparkles className="size-5 text-foreground" aria-hidden />
      </span>
      <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {options ? madeForYouEyebrow(options) : " "}
      </span>
      <span className="line-clamp-1 text-xs font-medium">Made for you</span>
    </>
  );

  if (options == null) {
    return (
      <div className={TILE_CLASS} aria-busy="true">
        {face}
      </div>
    );
  }

  if (options.length === 0) return null;

  return (
    <>
      <button type="button" className={TILE_CLASS} onClick={() => setSheetOpen(true)}>
        {face}
      </button>
      <MadeForYouSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        options={options}
        onSubmit={(shelfId, steer) => {
          setSheetOpen(false);
          start(shelfId, steer);
        }}
      />
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Clapperboard, Sparkles } from "lucide-react";

import { useRecommendationContext } from "@/components/recommend/RecommendationProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

import {
  madeForYouAction,
  madeForYouEyebrow,
  type RecommendOption,
} from "./up-next";

type CategoryMeta = {
  shelfId: RecommendShelfId;
  category: ItemCategory;
  label: string;
  noun: string;
  Icon: typeof BookOpen;
};

const CATEGORIES: CategoryMeta[] = [
  { shelfId: "books", category: "books", label: "Books", noun: "books", Icon: BookOpen },
  { shelfId: "watch", category: "movies_and_tv", label: "Watch", noun: "titles", Icon: Clapperboard },
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
 * The "Made for you" tile at the end of the Up next row. It opens the
 * recommendation deck (see RecommendationProvider). Render it only when at
 * least one recommendation category is enabled.
 */
export function MadeForYouTile({
  booksEnabled,
  watchEnabled,
  thumbs,
}: {
  booksEnabled: boolean;
  watchEnabled: boolean;
  /** Up to 3 cover URLs for the decorative stack. */
  thumbs: string[];
}) {
  const { start } = useRecommendationContext();
  const options = useRecommendOptions(booksEnabled, watchEnabled);

  const face = (
    <>
      <span className="relative flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed border-border bg-muted/50">
        {thumbs.length > 0 ? (
          <span className="flex -space-x-4" aria-hidden>
            {thumbs.slice(0, 3).map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy.
              <img
                key={src}
                src={src}
                alt=""
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

  const action = madeForYouAction(options);
  if (action.kind === "none") return null;
  if (action.kind === "start") {
    return (
      <button type="button" className={TILE_CLASS} onClick={() => start(action.shelfId)}>
        {face}
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className={TILE_CLASS} />}>
        {face}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Recommend from…</DropdownMenuLabel>
          {options.map((o) => {
            const meta = CATEGORIES.find((c) => c.shelfId === o.shelfId);
            if (!meta) return null;
            return (
              <DropdownMenuItem
                key={o.shelfId}
                disabled={!o.ready}
                onClick={o.ready ? () => start(o.shelfId) : undefined}
                className="flex-col items-start gap-0.5 py-2"
              >
                <span className="flex items-center gap-2 font-medium">
                  <meta.Icon className="size-4" aria-hidden />
                  {meta.label}
                </span>
                {!o.ready ? (
                  <span className="pl-6 text-xs text-muted-foreground">
                    Add {RECOMMEND_MIN_ITEMS}+ {meta.noun} to unlock
                  </span>
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

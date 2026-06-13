"use client";

import { useMemo, useState } from "react";
import { SparklesIcon } from "lucide-react";

import { RecommendDrawer } from "@/components/recommend/RecommendDrawer";
import { useRecommendations } from "@/components/recommend/useRecommendations";
import { Button } from "@/components/ui/button";
import { RECOMMEND_MAX_INPUT_ITEMS, RECOMMEND_MIN_ITEMS } from "@/lib/recommend/recommend-config";
import type { RecommendInputItem, RecommendShelfId } from "@/lib/recommend/recommend-types";
import type { LibraryItemRow } from "@/lib/types/library-item";

/**
 * Derive a RecommendInputItem from a LibraryItemRow.
 *
 * Books/movies subtitles are typically "Author · Year" or "Director · Year".
 * We extract what we can; missing fields become null.
 */
function toRecommendInputItem(item: LibraryItemRow): RecommendInputItem {
  let creator: string | null = null;
  let year: number | null = null;

  if (item.subtitle) {
    // Common subtitle formats: "Author · Year", "Author (Year)", "Author"
    const dotParts = item.subtitle.split("·").map((s) => s.trim());
    if (dotParts.length >= 2) {
      creator = dotParts[0] || null;
      const maybeYear = Number.parseInt(dotParts[dotParts.length - 1], 10);
      if (maybeYear >= 1000 && maybeYear <= 2100) year = maybeYear;
    } else if (dotParts.length === 1) {
      // Could be just "Author" or "Year"
      const maybeYear = Number.parseInt(dotParts[0], 10);
      if (maybeYear >= 1000 && maybeYear <= 2100) {
        year = maybeYear;
      } else {
        creator = dotParts[0] || null;
      }
    }
  }

  return {
    title: item.title ?? "",
    creator,
    year,
  };
}

type RecommendButtonProps = {
  shelfId: RecommendShelfId;
  /** Library items currently loaded for this shelf. */
  shelfItems: LibraryItemRow[];
};

export function RecommendButton({ shelfId, shelfItems }: RecommendButtonProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { state, fetch, reset } = useRecommendations();

  const recommendItems = useMemo(
    () =>
      shelfItems
        .filter((item) => item.title)
        .slice(0, RECOMMEND_MAX_INPUT_ITEMS)
        .map(toRecommendInputItem),
    [shelfItems],
  );

  const enabled = recommendItems.length >= RECOMMEND_MIN_ITEMS;

  function handleClick() {
    if (!enabled) return;
    setDrawerOpen(true);
    if (state.status === "idle" || state.status === "error") {
      void fetch(shelfId, recommendItems);
    }
  }

  function handleRetry() {
    void fetch(shelfId, recommendItems);
  }

  function handleOpenChange(open: boolean) {
    setDrawerOpen(open);
    if (!open) reset();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={!enabled}
        title={
          enabled
            ? `Get AI recommendations for ${shelfId}`
            : `Add at least ${RECOMMEND_MIN_ITEMS} items to get recommendations`
        }
        className="min-h-11 gap-1.5 lg-fine:min-h-9"
      >
        <SparklesIcon className="h-3.5 w-3.5" />
        Recommend
      </Button>

      <RecommendDrawer
        open={drawerOpen}
        onOpenChange={handleOpenChange}
        shelfId={shelfId}
        state={state}
        onRetry={handleRetry}
      />
    </>
  );
}

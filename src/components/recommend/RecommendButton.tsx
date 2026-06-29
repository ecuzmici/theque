"use client";

import { useMemo } from "react";
import { SparklesIcon } from "lucide-react";

import { useRecommendationContext } from "@/components/recommend/RecommendationProvider";
import { Button } from "@/components/ui/button";
import { RECOMMEND_MIN_ITEMS } from "@/lib/recommend/recommend-config";
import type { RecommendShelfId } from "@/lib/recommend/recommend-types";
import type { LibraryItemRow } from "@/lib/types/library-item";

type RecommendButtonProps = {
  shelfId: RecommendShelfId;
  /** Library items currently loaded for this shelf (used only for enablement). */
  shelfItems: LibraryItemRow[];
};

export function RecommendButton({ shelfId, shelfItems }: RecommendButtonProps) {
  const { start } = useRecommendationContext();

  const titledCount = useMemo(
    () => shelfItems.filter((item) => item.title?.trim()).length,
    [shelfItems],
  );

  const enabled = titledCount >= RECOMMEND_MIN_ITEMS;

  function handleClick() {
    if (!enabled) return;
    start(shelfId);
  }

  return (
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
  );
}

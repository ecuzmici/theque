"use client";

import { ExternalLinkIcon, SearchIcon, BookmarkPlusIcon } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { categoryPlaceholderClass } from "@/lib/category-placeholder";
import type { ResolvedRecommendation } from "@/lib/recommend/recommend-types";

type RecommendationCardProps = {
  card: ResolvedRecommendation;
  onSave: (card: ResolvedRecommendation) => void;
  onDismiss: (id: string) => void;
  saving?: boolean;
};

export function RecommendationCard({
  card,
  onSave,
  onDismiss,
  saving = false,
}: RecommendationCardProps) {
  const placeholderClass = categoryPlaceholderClass(
    card.source === "open_library" ? "books" : "movies_and_tv",
  );

  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-3">
      {/* Cover image */}
      <div
        className={`relative h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br ${placeholderClass}`}
      >
        {card.cover_url ? (
          <Image
            src={card.cover_url}
            alt={card.title}
            fill
            className="object-cover"
            sizes="64px"
            unoptimized
          />
        ) : null}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {card.title}
            </p>
            {card.subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{card.subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss recommendation"
            onClick={() => onDismiss(card.id)}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>

        <p className="line-clamp-2 text-xs text-muted-foreground">{card.description}</p>

        <p className="line-clamp-1 text-xs italic text-muted-foreground">{card.reason}</p>

        {/* Actions */}
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => onSave(card)}
            disabled={saving}
            className="h-7 gap-1.5 px-2.5 text-xs"
          >
            <BookmarkPlusIcon className="h-3.5 w-3.5" />
            Save to Library
          </Button>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(card.search_query)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-transparent px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <SearchIcon className="h-3.5 w-3.5" />
            Search
          </a>
          <a
            href={card.canonical_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-transparent px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            View
          </a>
        </div>
      </div>
    </div>
  );
}

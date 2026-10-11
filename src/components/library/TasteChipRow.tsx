"use client";

import { ChevronDown, X } from "lucide-react";
import { useState } from "react";

import type { TasteFacet, TasteFacets } from "@/components/library/useTasteFilter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ItemCategory } from "@/lib/database.types";
import {
  TASTE_CHIP_MIN_COUNT,
  genreLabel,
  moodLabel,
} from "@/lib/taste/taste-lists";
import { cn } from "@/lib/utils";

type TasteChipRowProps = {
  category: ItemCategory;
  facets: TasteFacets | null;
  loading?: boolean;
  genre: string | null;
  mood: string | null;
  onGenreChange: (key: string | null) => void;
  onMoodChange: (key: string | null) => void;
};

const CHIP_BASE =
  "inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border text-[13px] font-medium transition pointer-coarse:min-h-[var(--tap-target-min)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
// Active chips use an outline and a light tint. They never use amber or the shelf-chip fill.
const CHIP_ACTIVE = "border-foreground bg-foreground/[0.07] text-foreground";
const CHIP_IDLE = "border-border bg-card text-muted-foreground hover:text-foreground";

/** Keeps the chips that have enough items, plus the active key, in count order. */
export function visibleFacets(
  facets: TasteFacet[],
  activeKey: string | null,
  labelFor: (key: string) => string | null,
): TasteFacet[] {
  const shown = facets
    .filter((f) => f.count >= TASTE_CHIP_MIN_COUNT || f.key === activeKey)
    .sort((a, b) => b.count - a.count);
  if (activeKey && !shown.some((f) => f.key === activeKey)) {
    const label = labelFor(activeKey);
    if (label) shown.push({ key: activeKey, label, count: 0 });
  }
  return shown;
}

function MoodChip({
  moods,
  mood,
  onChange,
}: {
  moods: TasteFacet[];
  mood: string | null;
  onChange: (key: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeLabel = mood ? (moods.find((m) => m.key === mood)?.label ?? moodLabel(mood)) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "inline-flex shrink-0 items-center rounded-full border",
          activeLabel ? CHIP_ACTIVE : "border-dashed border-border bg-card",
        )}
      >
        <PopoverTrigger
          className={cn(
            "inline-flex min-h-8 items-center gap-1 rounded-full text-[13px] font-medium pointer-coarse:min-h-[var(--tap-target-min)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeLabel ? "pl-3 pr-1" : "px-3 text-muted-foreground hover:text-foreground",
          )}
        >
          {activeLabel ?? "Mood"}
          {activeLabel ? null : <ChevronDown className="size-3.5" aria-hidden />}
        </PopoverTrigger>
        {activeLabel ? (
          <button
            type="button"
            aria-label={`Clear mood ${activeLabel}`}
            onClick={() => onChange(null)}
            className="inline-flex min-h-8 items-center rounded-full pl-0.5 pr-2.5 pointer-coarse:min-h-[var(--tap-target-min)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3" aria-hidden />
          </button>
        ) : null}
      </div>
      <PopoverContent aria-label="Mood">
        <p className="mb-2 text-xs font-medium text-muted-foreground">In the mood for…</p>
        <div className="flex flex-wrap gap-1.5">
          {moods.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={m.key === mood}
              onClick={() => {
                onChange(m.key === mood ? null : m.key);
                setOpen(false);
              }}
              className={cn(CHIP_BASE, "px-3", m.key === mood ? CHIP_ACTIVE : CHIP_IDLE)}
            >
              {m.label}
              {m.count > 0 ? (
                <span className="text-[11px] tabular-nums text-muted-foreground/70">{m.count}</span>
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One row of filter chips for the Books and Watch shelves: a Mood chip with a
 * popover, a divider, then the genre chips. The row scrolls sideways and never
 * wraps. It renders nothing when the shelf has no chip to show.
 */
export function TasteChipRow({
  category,
  facets,
  loading = false,
  genre,
  mood,
  onGenreChange,
  onMoodChange,
}: TasteChipRowProps) {
  if (!facets) {
    return loading ? (
      <div
        className="h-8 w-2/3 animate-pulse rounded-full bg-muted pointer-coarse:h-[var(--tap-target-min)]"
        aria-hidden
      />
    ) : null;
  }

  const genres = visibleFacets(facets.genres, genre, (key) => genreLabel(category, key));
  const moods = visibleFacets(facets.moods, mood, moodLabel);
  if (genres.length === 0 && moods.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-label="Filter by genre and mood"
    >
      {moods.length > 0 ? <MoodChip moods={moods} mood={mood} onChange={onMoodChange} /> : null}
      {moods.length > 0 && genres.length > 0 ? (
        <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
      ) : null}
      {genres.length > 0 ? (
        <div
          className="-mr-4 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5 pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Genre"
        >
          {genres.map((g) => {
            const active = g.key === genre;
            return (
              <button
                key={g.key}
                type="button"
                aria-pressed={active}
                onClick={() => onGenreChange(active ? null : g.key)}
                className={cn(CHIP_BASE, "px-3", active ? CHIP_ACTIVE : CHIP_IDLE)}
              >
                {g.label}
                {active ? (
                  <X className="size-3" aria-hidden />
                ) : (
                  <span className="text-[11px] tabular-nums text-muted-foreground/70">
                    {g.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

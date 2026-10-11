"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, Clapperboard, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RECOMMEND_MIN_ITEMS } from "@/lib/recommend/recommend-config";
import type { RecommendShelfId } from "@/lib/recommend/recommend-types";
import { STEER_MAX_LENGTH, sanitizeSteer, steerFromChips } from "@/lib/recommend/steer";
import { MOODS, tasteShelfCategory } from "@/lib/taste/taste-lists";
import { cn } from "@/lib/utils";

import type { RecommendOption } from "./up-next";

export const SHELF_META: Record<
  RecommendShelfId,
  { label: string; noun: string; Icon: typeof BookOpen }
> = {
  books: { label: "Books", noun: "books", Icon: BookOpen },
  watch: { label: "Watch", noun: "titles", Icon: Clapperboard },
};

type SheetParams = {
  shelf?: string | null;
  genre?: string | null;
  mood?: string | null;
};

/**
 * The start values of the sheet, from the library URL params.
 * The toggle starts on `?shelf=` when it is books or watch, else on Books. A
 * locked or missing shelf falls back to the first ready shelf. The field starts
 * with the text of the active genre and mood chips. The search text `?q=` is not
 * an input, because a query is often part of a title.
 */
export function sheetDefaults(
  params: SheetParams,
  options: RecommendOption[],
): { shelf: RecommendShelfId | null; steer: string } {
  const preferred: RecommendShelfId = params.shelf === "watch" ? "watch" : "books";
  const ready = options.filter((o) => o.ready);
  const shelf =
    ready.find((o) => o.shelfId === preferred)?.shelfId ??
    ready[0]?.shelfId ??
    options.find((o) => o.shelfId === preferred)?.shelfId ??
    options[0]?.shelfId ??
    null;
  const steer = steerFromChips({
    category: tasteShelfCategory(params.shelf),
    genre: params.genre,
    mood: params.mood,
  });
  return { shelf, steer };
}

const CHIP_CLASS =
  "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-medium whitespace-nowrap transition pointer-coarse:min-h-[var(--tap-target-min)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function SheetBody({
  options,
  onSubmit,
}: {
  options: RecommendOption[];
  onSubmit: (shelf: RecommendShelfId, steer: string) => void;
}) {
  const params = useSearchParams();
  const [initial] = useState(() =>
    sheetDefaults(
      {
        shelf: params?.get("shelf"),
        genre: params?.get("genre"),
        mood: params?.get("mood"),
      },
      options,
    ),
  );
  const [shelf, setShelf] = useState(initial.shelf);
  const [text, setText] = useState(initial.steer);
  const fieldId = useId();

  const selected = options.find((o) => o.shelfId === shelf);
  const canRun = Boolean(selected?.ready);
  const locked = options.filter((o) => !o.ready);
  const normalized = text.trim().toLowerCase();

  function submit() {
    if (!shelf || !canRun) return;
    onSubmit(shelf, sanitizeSteer(text));
  }

  function onFieldKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  }

  return (
    <div className="flex flex-col gap-4 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3">
      {options.length > 1 ? (
        <div
          role="radiogroup"
          aria-label="Shelf"
          className="grid grid-cols-2 gap-1 rounded-full border border-border bg-muted/50 p-1"
        >
          {options.map((o) => {
            const meta = SHELF_META[o.shelfId];
            const isSelected = shelf === o.shelfId;
            return (
              <button
                key={o.shelfId}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!o.ready}
                onClick={() => setShelf(o.shelfId)}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-sm font-medium transition pointer-coarse:min-h-[var(--tap-target-min)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
                  isSelected
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <meta.Icon className="size-4" aria-hidden />
                {meta.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {locked.length > 0 ? (
        <p className="-mt-2 text-xs text-muted-foreground">
          {locked
            .map(
              (o) =>
                `Add ${RECOMMEND_MIN_ITEMS}+ ${SHELF_META[o.shelfId].noun} to unlock ${SHELF_META[o.shelfId].label}.`,
            )
            .join(" ")}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor={fieldId} className="sr-only">
          In the mood for
        </label>
        <div className="relative">
          <Sparkles
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id={fieldId}
            type="text"
            value={text}
            maxLength={STEER_MAX_LENGTH}
            placeholder="In the mood for…"
            enterKeyHint="go"
            autoComplete="off"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onFieldKeyDown}
            className="h-11 w-full rounded-full border border-border bg-background pl-9 pr-3 text-base outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div
          role="group"
          aria-label="Moods"
          className="scrollbar-none -mx-5 flex gap-1.5 overflow-x-auto px-5 pb-0.5"
        >
          {MOODS.map((m) => {
            const word = m.label.toLowerCase();
            const pressed = normalized === word;
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={pressed}
                onClick={() => setText(pressed ? "" : word)}
                className={cn(
                  CHIP_CLASS,
                  pressed
                    ? "border-foreground/60 bg-muted text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <Button
        type="button"
        disabled={!canRun}
        onClick={submit}
        className="h-11 w-full rounded-full bg-amber-500 text-base text-amber-950 hover:bg-amber-400 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400"
      >
        <Sparkles className="size-4" aria-hidden />
        Recommend
      </Button>
    </div>
  );
}

/**
 * The pre-run sheet of the "Made for you" tile (ADR 0020, decision 9). The user
 * picks Books or Watch, can add a mood text, and starts the run. An empty field
 * starts an unsteered run. The body mounts on each open, so it reads the
 * library URL params again every time.
 */
export function MadeForYouSheet({
  open,
  onOpenChange,
  options,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: RecommendOption[];
  onSubmit: (shelf: RecommendShelfId, steer: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="gap-0 rounded-t-2xl p-0 sm:mx-auto sm:mb-6 sm:max-w-md sm:rounded-2xl"
        showCloseButton
      >
        <SheetHeader className="px-5 pb-1 pt-5">
          <SheetTitle className="font-serif text-xl">Made for you</SheetTitle>
          <SheetDescription>Picks from your taste. Add a mood to steer them.</SheetDescription>
        </SheetHeader>
        <SheetBody options={options} onSubmit={onSubmit} />
      </SheetContent>
    </Sheet>
  );
}

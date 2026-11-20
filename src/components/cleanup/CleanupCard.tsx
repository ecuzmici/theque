"use client";

import Link from "next/link";
import { useRef, useState, type PointerEvent } from "react";

import { CoverImg, type CoverUrls } from "@/components/items/CoverImg";
import { categoryPlaceholderClass, categoryPlaceholderLabel } from "@/lib/category-placeholder";
import type { PassChoice } from "@/lib/cleanup/pass";
import { savedAgo } from "@/lib/cleanup/pass";
import type { ItemCategory } from "@/lib/database.types";
import { formatCategory } from "@/lib/item-labels";
import { cn } from "@/lib/utils";

/** A drag shorter than this is a tap, not a swipe. */
const DRAG_START_PX = 8;
/** A drag past this distance decides the card. */
const COMMIT_PX = 100;

export type CardItem = {
  id: string;
  created_at: string;
  title: string;
  byline: string | null;
  year: number | null;
  category: ItemCategory | null;
  color: string | null;
  cover: CoverUrls | null;
};

/** The card face: the cover on its own color, then the title block. */
export function CardFace({ item, now, linked = false }: { item: CardItem; now: number; linked?: boolean }) {
  const byline = [item.byline, item.year].filter(Boolean).join(" · ");
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "relative min-h-0 flex-1 bg-muted",
          !item.cover && !item.color && `bg-gradient-to-br ${categoryPlaceholderClass(item.category)}`,
        )}
        style={item.color ? { backgroundColor: item.color } : undefined}
      >
        {item.cover ? (
          <CoverImg
            urls={item.cover}
            loading="eager"
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full object-contain p-4 drop-shadow-lg"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-4 text-center font-heading text-lg text-white/90">
            {categoryPlaceholderLabel(item.category)}
          </span>
        )}
      </div>
      <div className="shrink-0 px-4 pt-3 pb-4">
        <p className="text-xs text-muted-foreground">
          {item.category ? `${formatCategory(item.category)} · ` : ""}saved {savedAgo(item.created_at, now)}
        </p>
        <p className="mt-1 line-clamp-2 font-heading text-xl leading-tight text-card-foreground">
          {linked ? (
            <Link
              href={`/item/${item.id}`}
              draggable={false}
              className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </p>
        {byline ? <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{byline}</p> : null}
      </div>
    </div>
  );
}

/**
 * The top card. A drag to the right keeps the item and a drag to the left
 * lets it go. The card tilts and shows the choice while it moves. `leaving`
 * flings the card off the screen after a button or key press.
 */
export function SwipeCard({
  item,
  now,
  leaving,
  reducedMotion,
  onSwipe,
}: {
  item: CardItem;
  now: number;
  leaving: PassChoice | null;
  reducedMotion: boolean;
  onSwipe: (choice: PassChoice) => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);
  const moved = useRef(false);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (leaving || e.button !== 0) return;
    start.current = e.clientX;
    moved.current = false;
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (start.current === null || leaving) return;
    // The button went up outside the card: stop the drag and put the card back.
    if (e.pointerType === "mouse" && e.buttons === 0) {
      start.current = null;
      moved.current = false;
      setDragging(false);
      setDx(0);
      return;
    }
    const next = e.clientX - start.current;
    if (!dragging) {
      if (Math.abs(next) < DRAG_START_PX) return;
      moved.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setDx(next);
  }

  function onPointerEnd() {
    start.current = null;
    // The click after a drag comes after this event, so clear the flag one task later.
    // Then a key press (Enter on the title link) works again after a snap-back.
    window.setTimeout(() => {
      moved.current = false;
    }, 0);
    if (!dragging) return;
    setDragging(false);
    if (dx > COMMIT_PX) onSwipe("keep");
    else if (dx < -COMMIT_PX) onSwipe("let_go");
    else setDx(0);
  }

  const flingX = typeof window === "undefined" ? 600 : window.innerWidth;
  const x = leaving === "keep" ? flingX : leaving === "let_go" ? -flingX : dx;
  const tilt = reducedMotion ? 0 : x / 18;
  const lean: PassChoice | null = leaving ?? (dx > DRAG_START_PX ? "keep" : dx < -DRAG_START_PX ? "let_go" : null);
  const strength = leaving ? 1 : Math.min(1, Math.abs(dx) / COMMIT_PX);

  // With reduced motion, a button or key press fades the card in place.
  const transform = reducedMotion && leaving ? "none" : `translateX(${x}px) rotate(${tilt}deg)`;

  return (
    <div
      className={cn(
        "absolute inset-0 touch-pan-y overflow-hidden rounded-2xl border border-border bg-card shadow-md select-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
        !dragging && "transition-[transform,opacity] duration-200 ease-out motion-reduce:duration-100",
        leaving && "opacity-0",
      )}
      style={{ transform }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={(e) => {
        // A drag ends with a click. Do not open the item after a drag.
        if (moved.current) e.preventDefault();
      }}
    >
      <CardFace item={item} now={now} linked />
      {lean ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-5 rounded-lg border-2 bg-card/85 px-3 py-1 text-base font-semibold tracking-wide uppercase",
            lean === "keep"
              ? "left-5 -rotate-12 border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300"
              : "right-5 rotate-12 border-destructive text-destructive",
          )}
          style={{ opacity: strength }}
        >
          {lean === "keep" ? "Keep" : "Let go"}
        </span>
      ) : null}
    </div>
  );
}

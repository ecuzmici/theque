"use client";

import type { KeyboardEvent } from "react";

import { getShelf, type ShelfId } from "@/lib/shelves";
import { cn } from "@/lib/utils";

type ShelfChipsProps = {
  shelves: ShelfId[];
  active: ShelfId;
  onSelect: (id: ShelfId) => void;
  inboxCount?: number | null;
};

/** The next tab for a key press in the WAI-ARIA tabs pattern, or null for other keys. */
export function nextShelfForKey(key: string, shelves: ShelfId[], active: ShelfId): ShelfId | null {
  const current = Math.max(0, shelves.indexOf(active));
  switch (key) {
    case "ArrowRight":
      return shelves[(current + 1) % shelves.length] ?? null;
    case "ArrowLeft":
      return shelves[(current - 1 + shelves.length) % shelves.length] ?? null;
    case "Home":
      return shelves[0] ?? null;
    case "End":
      return shelves[shelves.length - 1] ?? null;
    default:
      return null;
  }
}

/** Shelf tabs. The active chip uses the foreground color; amber stays for the primary action. */
export function ShelfChips({ shelves, active, onSelect, inboxCount }: ShelfChipsProps) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = nextShelfForKey(e.key, shelves, active);
    if (!next) return;
    e.preventDefault();
    onSelect(next);
    e.currentTarget
      .querySelector<HTMLButtonElement>(`[role="tab"][data-shelf-id="${next}"]`)
      ?.focus();
  }

  return (
    <div
      className="-mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="Shelves"
      onKeyDown={onKeyDown}
    >
      {shelves.map((id) => {
        const selected = id === active;
        const count = id === "inbox" && inboxCount != null && inboxCount > 0 ? inboxCount : null;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            data-shelf-id={id}
            onClick={() => onSelect(id)}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition pointer-coarse:min-h-[var(--tap-target-min)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              selected
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {getShelf(id).label}
            {count != null ? (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  selected ? "text-background/70" : "text-muted-foreground/70",
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

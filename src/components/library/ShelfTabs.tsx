"use client";

import { SHELVES, type ShelfId } from "@/lib/shelves";
import { cn } from "@/lib/utils";

type ShelfTabsProps = {
  activeShelf: ShelfId;
  inboxCount: number | null;
  onSelect: (id: ShelfId) => void;
};

/**
 * Text tabs with an ink underline; sticks below the mobile header (h-14) /
 * at the top on desktop so shelves stay reachable while scrolling the wall.
 */
export function ShelfTabs({ activeShelf, inboxCount, onSelect }: ShelfTabsProps) {
  return (
    <div className="sticky top-14 z-10 -mx-4 mb-6 bg-background/95 px-4 backdrop-blur lg:top-0">
      {/* WAI-ARIA tabs pattern: roving tabIndex + arrow key navigation */}
      <div
        role="tablist"
        aria-label="Shelves"
        className="flex gap-6 overflow-x-auto border-b border-border scrollbar-none"
        onKeyDown={(e) => {
          const tabs = SHELVES.map((s) => s.id);
          const currentIndex = tabs.indexOf(activeShelf);
          let nextIndex = currentIndex;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            nextIndex = (currentIndex + 1) % tabs.length;
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          } else if (e.key === "Home") {
            e.preventDefault();
            nextIndex = 0;
          } else if (e.key === "End") {
            e.preventDefault();
            nextIndex = tabs.length - 1;
          } else {
            return;
          }
          const nextShelf = tabs[nextIndex];
          if (nextShelf) {
            onSelect(nextShelf);
            // Move focus to the newly selected tab
            const tabEl = document.querySelector<HTMLButtonElement>(
              `[role="tab"][data-shelf-id="${nextShelf}"]`,
            );
            tabEl?.focus();
          }
        }}
      >
        {SHELVES.map((s) => {
          const selected = s.id === activeShelf;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              data-shelf-id={s.id}
              onClick={() => onSelect(s.id)}
              className={cn(
                "-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-t-sm border-b-2 pb-1 pt-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
              {s.id === "inbox" && inboxCount != null && inboxCount > 0 ? (
                <span className="font-mono text-[11px] tabular-nums text-primary">
                  {inboxCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

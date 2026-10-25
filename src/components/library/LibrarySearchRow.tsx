"use client";

import { Search, X } from "lucide-react";
import type { ReactNode } from "react";

import type { ItemStatus } from "@/lib/database.types";
import { SEARCH_STATUS_FILTERS } from "@/lib/library-search";
import { cn } from "@/lib/utils";

/** The `id` of the search field. The `/` shortcut focuses it. */
export const LIBRARY_SEARCH_INPUT_ID = "library-search";

type LibrarySearchRowProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  /** Label of the active shelf, or null for All. */
  shelfLabel: string | null;
  /** Status chips show only while a query is active and the shelf allows them. */
  showStatus: boolean;
  status: ItemStatus | null;
  onStatusChange: (status: ItemStatus | null) => void;
  /** The shelf chips, rendered between the field and the status chips. */
  children: ReactNode;
  /** The genre and mood chip row, rendered under the shelf chips. Null hides it. */
  filters?: ReactNode;
};

/**
 * Sticky block above the grid: a full-width search field, the shelf chips, the
 * optional genre and mood row, and (while a query is active) the status chips.
 * All of them stay pinned together.
 */
export function LibrarySearchRow({
  value,
  onChange,
  onClear,
  shelfLabel,
  showStatus,
  status,
  onStatusChange,
  children,
  filters = null,
}: LibrarySearchRowProps) {
  const placeholder = shelfLabel ? `Search ${shelfLabel}` : "Search your library";

  return (
    <div className="sticky top-14 z-10 -mx-4 mb-4 border-b border-border bg-background/92 px-4 pb-3.5 pt-3 backdrop-blur-md">
      <div role="search" className="relative">
        <label htmlFor={LIBRARY_SEARCH_INPUT_ID} className="sr-only">
          Search your library
        </label>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          id={LIBRARY_SEARCH_INPUT_ID}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && value) {
              e.preventDefault();
              onClear();
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-11 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={onClear}
            className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="mt-2.5">{children}</div>

      {filters ? <div className="mt-3">{filters}</div> : null}

      {showStatus ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs" role="group" aria-label="Status">
          <span className="mr-1 text-muted-foreground" aria-hidden>
            Status
          </span>
          {SEARCH_STATUS_FILTERS.map((s) => {
            const selected = status === s.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onStatusChange(selected ? null : s.id)}
                className={cn(
                  "h-7 rounded-full border px-2.5 font-medium transition pointer-coarse:min-h-9",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "border-dashed border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

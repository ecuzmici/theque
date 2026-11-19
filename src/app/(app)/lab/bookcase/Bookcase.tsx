"use client";

import { Link } from "next-view-transitions";
import { useMemo, useState } from "react";

import { prefersLightText } from "@/components/items/item-detail-header";
import { cn } from "@/lib/utils";

import { hashString, hueSortKey } from "../lab-color";
import type { LabItem } from "../lab-data";

type Shelf = "read" | "want" | "all";
type Order = "color" | "author" | "finished" | "rating" | "height";

const SHELVES: Array<{ id: Shelf; label: string }> = [
  { id: "read", label: "Read" },
  { id: "want", label: "To read" },
  { id: "all", label: "Everything" },
];

const ORDERS: Array<{ id: Order; label: string }> = [
  { id: "color", label: "Colour" },
  { id: "author", label: "Author" },
  { id: "finished", label: "Finished" },
  { id: "rating", label: "Rating" },
  { id: "height", label: "Thickness" },
];

const FALLBACK = "#57534e";

function surname(item: LabItem): string {
  const name = item.authors[0] ?? "";
  return name.split(/\s+/).pop()?.toLowerCase() ?? "";
}

function sortBooks(books: LabItem[], order: Order): LabItem[] {
  const copy = [...books];
  switch (order) {
    case "color":
      return copy.sort((a, b) => hueSortKey(a.color) - hueSortKey(b.color));
    case "author":
      return copy.sort(
        (a, b) => surname(a).localeCompare(surname(b)) || (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0),
      );
    case "finished":
      return copy.sort((a, b) => (b.doneAt ?? b.createdAt).localeCompare(a.doneAt ?? a.createdAt));
    case "rating":
      return copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case "height":
      return copy.sort((a, b) => (b.pages ?? 0) - (a.pages ?? 0));
  }
}

/** Spine thickness in px from the page count: 180 pages ≈ 18 px, 1000 pages ≈ 52 px. */
function spineWidth(pages: number | null): number {
  const p = pages ?? 320;
  return Math.round(Math.min(56, Math.max(16, 10 + p * 0.042)));
}

function Spine({ book }: { book: LabItem }) {
  const color = book.color ?? FALLBACK;
  const light = prefersLightText(color);
  const seed = hashString(book.id);
  const height = 150 + (seed % 46); // 150-195 px, like a mixed shelf
  const width = spineWidth(book.pages);
  const band = seed % 3; // three spine styles
  const author = book.authors[0]?.split(/\s+/).pop() ?? "";

  return (
    <Link
      href={`/item/${book.id}`}
      title={`${book.title}${book.authors[0] ? ` — ${book.authors[0]}` : ""}${book.rating ? ` · ${"★".repeat(book.rating)}` : ""}`}
      className="group relative flex shrink-0 flex-col items-center justify-between overflow-hidden rounded-[3px] py-2 shadow-[inset_-3px_0_6px_rgba(0,0,0,0.25),inset_2px_0_3px_rgba(255,255,255,0.12)] transition-transform duration-200 hover:-translate-y-3 focus-visible:-translate-y-3 focus-visible:outline-none"
      style={{
        height,
        width,
        backgroundColor: color,
        color: light ? "rgba(255,255,255,0.92)" : "rgba(28,25,23,0.9)",
      }}
    >
      {band === 0 ? (
        <span aria-hidden className="absolute inset-x-0 top-3 h-1.5 bg-current opacity-25" />
      ) : band === 1 ? (
        <span aria-hidden className="absolute inset-x-0 bottom-9 h-px bg-current opacity-40" />
      ) : null}
      <span
        className="max-h-[78%] overflow-hidden font-serif text-[11px] leading-none tracking-wide text-ellipsis whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]"
        style={{ fontSize: width < 20 ? 9 : 11 }}
      >
        {book.title}
      </span>
      <span className="font-mono text-[8px] uppercase leading-none tracking-wider opacity-70 [writing-mode:vertical-rl]">
        {author.slice(0, 10)}
      </span>
      {book.rating === 5 ? (
        <span aria-hidden className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-amber-400" />
      ) : null}
    </Link>
  );
}

export function Bookcase({ books }: { books: LabItem[] }) {
  const [shelf, setShelf] = useState<Shelf>("read");
  const [order, setOrder] = useState<Order>("color");

  const visible = useMemo(() => {
    const picked = books.filter((b) =>
      shelf === "all" ? true : shelf === "read" ? b.status === "done" : b.status !== "done",
    );
    return sortBooks(picked, order);
  }, [books, shelf, order]);

  const pages = visible.reduce((sum, b) => sum + (b.pages ?? 0), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="radiogroup" aria-label="Shelf" className="flex gap-1 rounded-full bg-muted p-1">
          {SHELVES.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={shelf === s.id}
              onClick={() => setShelf(s.id)}
              className={cn(
                "min-h-8 rounded-full px-3 text-xs",
                shelf === s.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>Order by</span>
          {ORDERS.map((o) => (
            <button
              key={o.id}
              onClick={() => setOrder(o.id)}
              className={cn(
                "min-h-8 rounded-full border px-2.5",
                order === o.id ? "border-foreground text-foreground" : "border-border hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        {visible.length} books · {pages.toLocaleString("en-US")} pages · a gold dot marks a 5-star book. Hover a
        spine to pull it out.
      </p>

      <div className="mt-6 rounded-xl bg-[#2a2018] p-3 pb-0 shadow-inner ring-1 ring-black/40 sm:p-5 sm:pb-0">
        <div className="flex flex-wrap items-end gap-x-[2px] gap-y-0">
          {visible.map((book) => (
            <div key={book.id} className="flex h-[212px] items-end border-b-[10px] border-[#4a3626] pt-4">
              <Spine book={book} />
            </div>
          ))}
          <div className="h-[212px] flex-1 border-b-[10px] border-[#4a3626]" />
        </div>
      </div>
    </div>
  );
}

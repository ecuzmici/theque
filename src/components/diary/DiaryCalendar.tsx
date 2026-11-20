"use client";

import { useState } from "react";

import type { Calendar, CalendarDay, DiaryInput } from "@/lib/diary/diary";
import { cn } from "@/lib/utils";

/** The fields that one calendar square needs. */
export type CalendarBook = DiaryInput & { color: string | null };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function dayLabel(day: CalendarDay<CalendarBook>): string {
  const date = new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return `${date}: ${day.books.map((b) => b.title).join(", ")}`;
}

/**
 * A year of small month grids. A day with a finished book takes the colour of
 * that book's cover. A month in the timeline links to its part of it.
 */
export function DiaryCalendar({
  calendar,
  year,
  linkedMonths,
}: {
  calendar: Calendar<CalendarBook>;
  year: number;
  /** Months (0 = January) that the timeline shows. Only these months get a link. */
  linkedMonths: number[];
}) {
  const [hover, setHover] = useState<CalendarDay<CalendarBook> | null>(null);

  return (
    <div>
      <ol className="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
        {calendar.months.map((month) => {
          const name = MONTHS[month.month]!;
          const label = month.count
            ? `${name}: ${month.count} ${month.count === 1 ? "book" : "books"}`
            : `${name}: no books`;
          const grid = (
            <>
              <span className="flex items-baseline justify-between gap-1 text-xs">
                <span className={month.count ? "font-medium text-foreground" : "text-muted-foreground"}>
                  {name.slice(0, 3)}
                </span>
                {month.count ? <span className="tabular-nums text-muted-foreground">{month.count}</span> : null}
              </span>
              <span className="mt-1.5 grid grid-cols-7 gap-[2px]" aria-hidden>
                {month.weeks.flat().map((cell, i) => {
                  if (!cell) return <span key={i} className="aspect-square" />;
                  const first = cell.books[0];
                  if (!first) return <span key={i} className="aspect-square rounded-[2px] bg-muted-foreground/15" />;
                  return (
                    <span
                      key={i}
                      onPointerEnter={() => setHover(cell)}
                      onPointerLeave={() => setHover((h) => (h?.date === cell.date ? null : h))}
                      className={cn(
                        "relative aspect-square rounded-[2px] ring-1 ring-foreground/30 ring-inset",
                        hover?.date === cell.date && "outline-2 outline-offset-1 outline-foreground",
                      )}
                      style={{ backgroundColor: first.color ?? "var(--muted-foreground)" }}
                    >
                      {cell.books.length > 1 ? (
                        <span className="absolute top-1/2 left-1/2 size-1 -translate-1/2 rounded-full bg-background" />
                      ) : null}
                    </span>
                  );
                })}
              </span>
            </>
          );
          return (
            <li key={month.month}>
              {linkedMonths.includes(month.month) ? (
                <a
                  href={`#month-${month.month + 1}`}
                  aria-label={`${label}. Go to the books.`}
                  className="-m-1.5 block rounded-lg p-1.5 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {grid}
                </a>
              ) : (
                <div role="img" aria-label={label} className="-m-1.5 p-1.5">
                  {grid}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-4 min-h-4 text-xs text-muted-foreground" aria-hidden>
        {hover ? dayLabel(hover) : `Each square is a day of ${year}. A finished book gives it the colour of its cover. A dot marks two or more.`}
      </p>
    </div>
  );
}

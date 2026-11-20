import { Star } from "lucide-react";
import { Link } from "next-view-transitions";

import { CoverImg, type CoverUrls } from "@/components/items/CoverImg";
import type { TimelineMonth } from "@/lib/diary/diary";
import { cn } from "@/lib/utils";

import type { CalendarBook } from "./DiaryCalendar";

/** One timeline row. The page decrypts `verdict` before it gets here. */
export type DiaryEntry = CalendarBook & {
  cover: CoverUrls | null;
  rating: number | null;
  verdict: string | null;
  authors: string[];
};

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

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-px text-amber-500" role="img" aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("size-3", n <= value ? "fill-current" : "opacity-30")} aria-hidden />
      ))}
    </span>
  );
}

export function DiaryTimeline({ months }: { months: TimelineMonth<DiaryEntry>[] }) {
  return (
    <div className="space-y-8">
      {months.map((group) => (
        <section key={group.month} id={`month-${group.month + 1}`} className="scroll-mt-24" aria-label={MONTHS[group.month]}>
          <h3 className="flex items-baseline gap-2 border-b border-border pb-2 text-sm">
            <span className="font-medium text-foreground">{MONTHS[group.month]}</span>
            <span className="tabular-nums text-muted-foreground">
              {group.entries.length} {group.entries.length === 1 ? "book" : "books"}
            </span>
          </h3>
          <ul className="mt-2 space-y-1">
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/item/${entry.id}`}
                  className="-mx-2 flex gap-4 rounded-xl p-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div
                    className="h-[84px] w-14 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm"
                    style={!entry.cover && entry.color ? { backgroundColor: entry.color } : undefined}
                  >
                    {entry.cover ? <CoverImg urls={entry.cover} className="size-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <p className="font-serif text-lg leading-snug text-foreground">{entry.title}</p>
                    {entry.authors.length ? (
                      <p className="truncate text-sm text-muted-foreground">{entry.authors.join(", ")}</p>
                    ) : null}
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <time dateTime={entry.doneAt ?? undefined}>
                        {new Date(entry.doneAt!).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                          timeZone: "UTC",
                        })}
                      </time>
                      {entry.rating ? <Stars value={entry.rating} /> : null}
                    </p>
                    {entry.verdict ? (
                      <blockquote className="mt-2 border-l-2 border-border pl-3 font-serif text-[15px] leading-relaxed text-foreground/85 italic">
                        {entry.verdict}
                      </blockquote>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

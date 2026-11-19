"use client";

import { Link } from "next-view-transitions";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export type RadarEntry = {
  kind: "book" | "film";
  title: string;
  creator: string;
  date: string | null;
  image: string | null;
  popularity: number;
  link: string | null;
  goodreads: string | null;
  because: { id: string; title: string; rating: number } | null;
};

function when(date: string | null, now: number): { label: string; upcoming: boolean } {
  if (!date) return { label: "Announced", upcoming: true };
  const days = Math.round((Date.parse(date) - now) / 86_400_000);
  const pretty = new Date(date).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  if (days > 0) return { label: days < 45 ? `In ${days} days` : `Out ${pretty}`, upcoming: true };
  if (days > -60) return { label: "Just out", upcoming: false };
  return { label: pretty, upcoming: false };
}

export function Radar({
  entries,
  authorCount,
  directorCount,
  now,
}: {
  entries: RadarEntry[];
  authorCount: number;
  directorCount: number;
  now: number;
}) {
  const [kind, setKind] = useState<"all" | "book" | "film">("all");
  const [onlyUpcoming, setOnlyUpcoming] = useState(false);

  const shown = useMemo(
    () =>
      entries
        .filter((e) => kind === "all" || e.kind === kind)
        .filter((e) => !onlyUpcoming || when(e.date, now).upcoming)
        .sort((a, b) => (b.date ?? "9999").localeCompare(a.date ?? "9999")),
    [entries, kind, now, onlyUpcoming],
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Watching {authorCount} authors and {directorCount} directors you rated 4 or 5 stars. Titles already in your library are left
        out.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Kind" className="flex gap-1 rounded-full bg-muted p-1">
          {(
            [
              ["all", "All"],
              ["book", "Books"],
              ["film", "Films"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="radio"
              aria-checked={kind === id}
              onClick={() => setKind(id)}
              className={cn("min-h-8 rounded-full px-3 text-xs", kind === id ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={onlyUpcoming} onChange={(e) => setOnlyUpcoming(e.target.checked)} className="size-4 accent-primary" />
          Only not out yet
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-border p-5 text-sm text-muted-foreground">Nothing new from your favourites in this window.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((entry) => {
            const w = when(entry.date, now);
            return (
              <li key={`${entry.kind}-${entry.title}-${entry.creator}`} className="flex gap-4 rounded-2xl border border-border bg-card/60 p-3">
                <a
                  href={entry.goodreads ?? entry.link ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-md bg-muted shadow"
                >
                  {entry.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- prototype; remote cover
                    <img src={entry.image} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center p-2 text-center font-serif text-xs text-muted-foreground">{entry.title}</span>
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        w.upcoming ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                      )}
                    >
                      {w.label}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{entry.kind}</span>
                  </div>
                  <p className="mt-1 font-serif text-lg leading-tight">{entry.title}</p>
                  <p className="text-xs text-muted-foreground">{entry.creator}</p>
                  {entry.because ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Because you gave{" "}
                      <Link href={`/item/${entry.because.id}`} className="text-foreground underline-offset-4 hover:underline">
                        {entry.because.title}
                      </Link>{" "}
                      <span className="text-amber-500">{"★".repeat(entry.because.rating)}</span>
                    </p>
                  ) : null}
                  <div className="mt-2 flex gap-3 text-xs">
                    {entry.goodreads ? (
                      <a href={entry.goodreads} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                        Goodreads ↗
                      </a>
                    ) : null}
                    {entry.link ? (
                      <a href={entry.link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                        {entry.kind === "book" ? "Hardcover" : "TMDB"} ↗
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">Data: Hardcover for books, TMDB for films. Cached for a day.</p>
    </div>
  );
}

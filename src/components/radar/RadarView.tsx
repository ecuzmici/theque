"use client";

import { Link } from "next-view-transitions";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Radar, RadarEntry, SourceState } from "@/lib/radar";
import { cn } from "@/lib/utils";

import { filterRadar, radarCounts, type RadarKind } from "./radar-filter";
import { RadarSaveButton } from "./RadarSaveButton";

const KINDS: Array<[RadarKind, string]> = [
  ["all", "All"],
  ["book", "Books"],
  ["film", "Films"],
];

const CHIP =
  "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition pointer-coarse:min-h-[var(--tap-target-min)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

const OUTBOUND =
  "inline-flex items-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline pointer-coarse:min-h-[var(--tap-target-min)]";

function sourceNote(kind: "books" | "films", state: SourceState): string | null {
  const source = kind === "books" ? "Hardcover" : "TMDB";
  if (state === "no_key") return `${kind === "books" ? "Books" : "Films"} are off: the server has no ${source} API key.`;
  if (state === "error") return `${source} did not answer, so ${kind} are missing. Try again later.`;
  return null;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function RadarView({ radar }: { radar: Radar }) {
  const [kind, setKind] = useState<RadarKind>("all");
  const [upcomingOnly, setUpcomingOnly] = useState(false);

  const { entries, watching, sources } = radar;
  const notes = [sourceNote("books", sources.books), sourceNote("films", sources.films)].filter(
    (n): n is string => n !== null,
  );

  if (watching.authors + watching.directors === 0) {
    return (
      <EmptyCard title="Nobody to follow yet">
        <p>Rate a finished book or film 4 or 5 stars. New work by its author or director shows up here.</p>
        <Button nativeButton={false} variant="outline" render={<Link href="/library" />} className="mt-4">
          Open your library
        </Button>
      </EmptyCard>
    );
  }

  if (entries.length === 0 && notes.length > 0 && sources.books !== "ok" && sources.films !== "ok") {
    return (
      <EmptyCard title="Release lookups are off">
        {notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </EmptyCard>
    );
  }

  const counts = radarCounts(entries, upcomingOnly);
  const shown = filterRadar(entries, kind, upcomingOnly);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Following {plural(watching.authors, "author", "authors")} and {plural(watching.directors, "director", "directors")} you
        rated 4 or 5 stars. Titles you saved stay off the list.
      </p>
      {notes.map((note) => (
        <p key={note} role="status" className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
          {note}
        </p>
      ))}

      {entries.length > 0 ? (
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div role="group" aria-label="Kind" className="flex gap-2">
            {KINDS.filter(([id]) => id === "all" || id === kind || counts[id] > 0).map(([id, label]) => {
              const selected = kind === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setKind(id)}
                  className={cn(
                    CHIP,
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                  <span className={cn("text-xs tabular-nums", selected ? "text-background/70" : "text-muted-foreground/70")}>
                    {counts[id]}
                  </span>
                </button>
              );
            })}
          </div>
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
          <button
            type="button"
            aria-pressed={upcomingOnly}
            onClick={() => setUpcomingOnly((v) => !v)}
            className={cn(
              CHIP,
              upcomingOnly
                ? "border-foreground bg-foreground/[0.07] text-foreground"
                : "border-dashed border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            Not out yet
          </button>
        </div>
      ) : null}

      {entries.length === 0 ? (
        <EmptyCard title="Nothing new">
          <p>Your favourites have no new or announced titles from the last 18 months.</p>
        </EmptyCard>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-border p-5 text-sm text-muted-foreground">
          No {kind === "all" ? "titles" : kind === "book" ? "books" : "films"} on the way right now.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((entry) => (
            <RadarCard key={entry.key} entry={entry} />
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">Books from Hardcover, films from TMDB. The list refreshes once a day.</p>
    </div>
  );
}

function EmptyCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5 text-sm text-muted-foreground sm:p-6">
      <h2 className="mb-1 font-heading text-lg text-foreground">{title}</h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ReleasePill({ release }: { release: RadarEntry["release"] }) {
  const justOut = release.label === "Just out";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        release.upcoming
          ? "bg-foreground/[0.08] text-foreground"
          : justOut
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "text-muted-foreground",
      )}
    >
      {release.label}
    </span>
  );
}

function RadarCover({ entry }: { entry: RadarEntry }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={entry.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${entry.title} on ${entry.source}`}
      className="relative aspect-[2/3] w-[4.5rem] shrink-0 overflow-hidden rounded-md bg-muted shadow-sm sm:w-24"
    >
      {entry.image && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote cover from Hardcover or TMDB
        <img
          src={entry.image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center p-2 text-center font-heading text-xs leading-tight text-muted-foreground">
          {entry.title}
        </span>
      )}
    </a>
  );
}

function RadarCard({ entry }: { entry: RadarEntry }) {
  const kindLabel = entry.kind === "book" ? "Book" : entry.url.includes("/tv/") ? "TV" : "Film";
  return (
    <li className="flex min-w-0 gap-3 rounded-2xl sm:gap-4 border border-border bg-card/60 p-3">
      <RadarCover entry={entry} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <ReleasePill release={entry.release} />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{kindLabel}</span>
        </div>
        <p className="mt-1 break-words font-heading text-lg leading-tight text-foreground">{entry.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {entry.creator}
          {entry.series ? ` · ${entry.series.name}${entry.series.position ? ` #${entry.series.position}` : ""}` : ""}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          You gave{" "}
          <Link href={`/item/${entry.because.id}`} className="text-foreground underline-offset-4 hover:underline">
            {entry.because.title}
          </Link>{" "}
          <span className="text-amber-500" aria-label={`${entry.because.rating} stars`}>
            {"★".repeat(entry.because.rating)}
          </span>
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2">
          <RadarSaveButton url={entry.url} title={entry.title} />
          <a href={entry.url} target="_blank" rel="noopener noreferrer" className={OUTBOUND}>
            {entry.source} ↗
          </a>
          {entry.goodreadsUrl ? (
            <a href={entry.goodreadsUrl} target="_blank" rel="noopener noreferrer" className={OUTBOUND}>
              Goodreads ↗
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

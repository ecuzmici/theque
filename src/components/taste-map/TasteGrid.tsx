import Link from "next/link";

import { libraryHref, type EmptySkyTag, type TagStat } from "@/lib/taste-map/taste-map";
import { cn } from "@/lib/utils";

import { countFill, RATING_SCALE_VARS } from "./scale";
import type { TasteMapData } from "./types";

const STAR_COLUMNS = [1, 2, 3, 4, 5] as const;

function byRating(a: TagStat, b: TagStat): number {
  if (a.avgRating === null && b.avgRating === null) return b.count - a.count;
  if (a.avgRating === null) return 1;
  if (b.avgRating === null) return -1;
  return b.avgRating - a.avgRating || b.rated - a.rated;
}

function skyLine(tag: EmptySkyTag): string {
  return tag.reason === "low"
    ? `${tag.avgRating!.toFixed(1)}★ on average over ${tag.rated} rated`
    : `${tag.count} saved, ${tag.done} finished`;
}

/** Variant 3: a grid of genre against rating, with the empty sky on top. */
export function TasteGrid({ data }: { data: TasteMapData }) {
  const rows = data.stats.filter((s) => s.count >= 2);
  const genres = rows.filter((s) => s.kind === "genre").sort(byRating);
  const moods = rows.filter((s) => s.kind === "mood").sort(byRating);
  const maxStars = Math.max(1, ...rows.flatMap((s) => s.stars));
  const maxLater = Math.max(1, ...rows.map((s) => s.backlog));
  const sky = new Map(data.sky.map((s) => [s.key, s]));

  return (
    <div className={cn("space-y-8", RATING_SCALE_VARS)}>
      <section>
        <h2 className="text-sm font-medium">Empty sky</h2>
        <p className="mt-1 text-sm text-muted-foreground">Genres you save but rarely finish, or finish and rate low.</p>
        {data.sky.length ? (
          <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {data.sky.slice(0, 4).map((tag) => (
              <li key={tag.key}>
                <Link
                  href={libraryHref(tag)}
                  className="block h-full rounded-xl border border-dashed border-border bg-card px-3 py-2.5 sm:px-4 sm:py-3 transition hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className={cn("font-heading text-base leading-tight sm:text-lg", tag.kind === "mood" && "italic")}>{tag.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{skyLine(tag)}</p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Nothing here. You finish what you save.</p>
        )}
      </section>

      <GridSection title="Genres" rows={genres} maxStars={maxStars} maxLater={maxLater} sky={sky} />
      <GridSection title="Moods" rows={moods} maxStars={maxStars} maxLater={maxLater} sky={sky} />

      <p className="text-xs text-muted-foreground">
        Each cell counts finished items with that rating. A stronger blue means more. Later counts what you have not finished.
        Rows run from your best-rated genre down.
      </p>
    </div>
  );
}

const GRID = "grid grid-cols-[minmax(0,1fr)_repeat(6,2rem)_2.25rem] items-center gap-1 sm:grid-cols-[minmax(0,14rem)_repeat(6,3rem)_3.5rem]";

function GridSection({
  title,
  rows,
  maxStars,
  maxLater,
  sky,
}: {
  title: string;
  rows: TagStat[];
  maxStars: number;
  maxLater: number;
  sky: Map<string, EmptySkyTag>;
}) {
  if (!rows.length) return null;
  return (
    <section>
      <div className={cn(GRID, "mb-1 text-[11px] text-muted-foreground")}>
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <span className="text-center">Later</span>
        {STAR_COLUMNS.map((n) => (
          <span key={n} className="text-center tabular-nums">
            {n}★
          </span>
        ))}
        <span className="text-right">Avg</span>
      </div>
      <ul className="space-y-1">
        {rows.map((row) => {
          const empty = sky.get(row.key);
          return (
            <li key={row.key}>
              <Link
                href={libraryHref(row)}
                className={cn(
                  GRID,
                  "rounded-lg py-0.5 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                aria-label={`${row.label}: ${row.count} saved, ${row.backlog} not finished`}
              >
                <span className="flex min-w-0 items-center gap-1.5 pl-1 text-sm">
                  <span className={cn("truncate", row.kind === "mood" && "italic")}>{row.label}</span>
                  {empty ? (
                    <span
                      className="size-2 shrink-0 rounded-full border border-dashed border-foreground/60"
                      title={empty.reason === "low" ? "Rated low" : "Rarely finished"}
                    />
                  ) : null}
                </span>
                <Cell count={row.backlog} later max={maxLater} />
                {STAR_COLUMNS.map((n) => (
                  <Cell key={n} count={row.stars[n - 1]} max={maxStars} />
                ))}
                <span className="pr-1 text-right text-sm tabular-nums text-muted-foreground">
                  {row.avgRating === null ? "–" : row.avgRating.toFixed(1)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Cell({ count, max, later = false }: { count: number; max: number; later?: boolean }) {
  const fill = countFill(count, max);
  const strong = !later && (fill === "var(--tm-3)" || fill === "var(--tm-4)");
  // The Later column uses grey, so the backlog never reads as a rating.
  const grey = `color-mix(in oklab, var(--foreground) ${Math.round(6 + (count / max) * 30)}%, transparent)`;
  return (
    <span
      className={cn(
        "flex aspect-square items-center justify-center rounded-md text-[11px] tabular-nums",
        count > 0 ? "" : "bg-muted/60",
        later && "border border-dashed border-foreground/25",
        strong ? "text-white dark:text-zinc-900" : "text-foreground",
      )}
      style={count > 0 ? { background: later ? grey : fill } : undefined}
    >
      {count > 0 ? count : ""}
    </span>
  );
}

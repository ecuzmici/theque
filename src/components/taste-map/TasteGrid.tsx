"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { libraryHref, sortByRating, type EmptySkyTag, type TagStat } from "@/lib/taste-map/taste-map";
import { cn } from "@/lib/utils";

import { COUNT_SCALE_VARS, countStep } from "./scale";
import type { TasteMapData } from "./types";

const STAR_COLUMNS = [1, 2, 3, 4, 5] as const;
const WIDE_QUERY = "(min-width: 64rem)";

function useWide(): boolean {
  const subscribe = useCallback((notify: () => void) => {
    const mq = window.matchMedia(WIDE_QUERY);
    mq.addEventListener("change", notify);
    return () => mq.removeEventListener("change", notify);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

function stars(avg: number): string {
  return `${avg.toFixed(1)}★`;
}

function skyLine(tag: EmptySkyTag): string {
  return tag.reason === "low"
    ? `${stars(tag.avgRating!)} from ${tag.rated} ratings, below your usual`
    : `${tag.count} saved, ${tag.done} finished`;
}

/** The taste grid: genre against rating, with the empty sky on top and a detail per row. */
export function TasteGrid({ data }: { data: TasteMapData }) {
  const [selected, setSelected] = useState<string | null>(null);
  const wide = useWide();
  const rows = data.stats.filter((s) => s.count >= 2);
  const genres = sortByRating(
    rows.filter((s) => s.kind === "genre"),
    data.mean,
  );
  const moods = sortByRating(
    rows.filter((s) => s.kind === "mood"),
    data.mean,
  );
  const maxStars = Math.max(1, ...rows.flatMap((s) => s.stars));
  const maxWant = Math.max(1, ...rows.map((s) => s.backlog));
  const stat = selected ? (data.stats.find((s) => s.key === selected) ?? null) : null;
  const sky = data.sky.find((s) => s.key === selected) ?? null;
  const toggle = (key: string) => setSelected((cur) => (cur === key ? null : key));


  return (
    <div className={cn("lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10", COUNT_SCALE_VARS)}>
      <div className="space-y-8">
        <section aria-labelledby="sky-title">
          <h2 id="sky-title" className="text-sm font-medium">
            Empty sky
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What you save but rarely finish, or rate below your usual
            {data.mean !== null ? ` (${stars(data.mean)})` : ""}.
          </p>
          {data.sky.length ? (
            <ul className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
              {data.sky.slice(0, 4).map((tag) => (
                <li key={tag.key}>
                  <button
                    type="button"
                    aria-pressed={selected === tag.key}
                    onClick={() => toggle(tag.key)}
                    className={cn(
                      "block h-full w-full rounded-xl border border-dashed bg-card px-3 py-2.5 text-left transition hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4 sm:py-3",
                      selected === tag.key ? "border-foreground" : "border-border",
                    )}
                  >
                    <span className={cn("block font-heading text-base leading-tight sm:text-lg", tag.kind === "mood" && "italic")}>
                      {tag.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground sm:text-sm">{skyLine(tag)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Nothing here. You finish what you save.</p>
          )}
        </section>

        <GridSection title="Genres" rows={genres} maxStars={maxStars} maxWant={maxWant} selected={selected} onPick={toggle} />
        <GridSection title="Moods" rows={moods} maxStars={maxStars} maxWant={maxWant} selected={selected} onPick={toggle} />

        <p className="text-xs text-muted-foreground">
          Each cell counts finished items with that rating. A stronger orange means more. Want counts what you saved and
          have not finished. Rows sort by average rating, and a genre with few ratings sits closer to your usual.
        </p>
      </div>

      <aside className="sticky top-20 hidden lg:block" aria-live="polite">
        <div className="rounded-2xl border border-border bg-card p-5">
          {wide && stat ? <Detail stat={stat} sky={sky} data={data} onPick={setSelected} /> : (
            <p className="text-sm text-muted-foreground">Pick a row to see what it goes with and open it on the shelf.</p>
          )}
        </div>
      </aside>

      <Sheet open={!wide && !!stat} onOpenChange={(open) => (open ? null : setSelected(null))}>
        <SheetContent side="bottom" className="rounded-t-2xl px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {!wide && stat ? <Detail stat={stat} sky={sky} data={data} onPick={setSelected} inSheet /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Detail({
  stat,
  sky,
  data,
  onPick,
  inSheet = false,
}: {
  stat: TagStat;
  sky: EmptySkyTag | null;
  data: TasteMapData;
  onPick: (key: string) => void;
  inSheet?: boolean;
}) {
  const href = libraryHref(stat);
  const shelf = href.includes("shelf=watch") ? "Watch" : "Books";
  const often = data.often[stat.key] ?? [];
  return (
    <div className="space-y-4">
      <div className="pr-8">
        <p className="text-xs text-muted-foreground">{stat.kind === "genre" ? "Genre" : "Mood"}</p>
        <DetailTitle inSheet={inSheet} className={cn("font-heading text-2xl leading-tight", stat.kind === "mood" && "italic")}>
          {stat.label}
        </DetailTitle>
        {sky ? <p className="mt-1 text-sm text-muted-foreground">In your empty sky: {sky.reason === "low" ? "rated below your usual" : "rarely finished"}.</p> : null}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Fact term="Saved" value={String(stat.count)} />
        <Fact term="Finished" value={String(stat.done)} />
        <Fact term={stat.rated ? `Average, ${stat.rated} rated` : "Average"} value={stat.avgRating === null ? "–" : stars(stat.avgRating)} />
      </dl>
      {often.length ? (
        <div>
          <p className="text-xs text-muted-foreground">Often with</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {often.map((o) => (
              <li key={o.key}>
                <button
                  type="button"
                  onClick={() => onPick(o.key)}
                  aria-label={`${o.label}, ${o.shared} items together`}
                  className={cn(
                    "inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-card px-3 text-[13px] font-medium text-muted-foreground transition hover:text-foreground pointer-coarse:min-h-[var(--tap-target-min)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    o.kind === "mood" && "italic",
                  )}
                >
                  {o.label} <span className="text-[11px] not-italic tabular-nums text-muted-foreground/70">{o.shared}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Button variant="outline" nativeButton={false} render={<Link href={href} />} className="w-full">
        Open on the {shelf} shelf
      </Button>
    </div>
  );
}

/** The sheet title inside the sheet, and a plain heading in the side panel. */
function DetailTitle({
  inSheet,
  className,
  children,
}: {
  inSheet: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (!inSheet) return <h2 className={className}>{children}</h2>;
  return (
    <>
      <SheetTitle className={className}>{children}</SheetTitle>
      <SheetDescription className="sr-only">Counts and related tags</SheetDescription>
    </>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-col-reverse rounded-xl bg-muted/60 px-2 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{term}</dt>
      <dd className="text-lg font-medium tabular-nums">{value}</dd>
    </div>
  );
}

const GRID =
  "grid grid-cols-[minmax(0,1fr)_repeat(6,1.75rem)_3.25rem] items-center gap-1 sm:grid-cols-[minmax(0,14rem)_repeat(6,2.75rem)_4rem]";

function GridSection({
  title,
  rows,
  maxStars,
  maxWant,
  selected,
  onPick,
}: {
  title: string;
  rows: TagStat[];
  maxStars: number;
  maxWant: number;
  selected: string | null;
  onPick: (key: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <section>
      <div className={cn(GRID, "mb-1 text-[11px] text-muted-foreground")}>
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <span className="text-center" aria-hidden>
          Want
        </span>
        {STAR_COLUMNS.map((n) => (
          <span key={n} className="text-center tabular-nums" aria-hidden>
            {n}★
          </span>
        ))}
        <span className="text-right" aria-hidden>
          Avg
        </span>
      </div>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              aria-pressed={selected === row.key}
              onClick={() => onPick(row.key)}
              className={cn(
                GRID,
                "w-full rounded-lg py-0.5 text-left transition pointer-coarse:min-h-[var(--tap-target-min)] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected === row.key && "bg-muted",
              )}
              aria-label={`${row.label}: ${row.count} saved, ${row.done} finished, ${
                row.avgRating === null ? "no ratings" : `${row.avgRating.toFixed(1)} stars from ${row.rated} ratings`
              }`}
            >
              <span className={cn("line-clamp-2 pl-1 text-[13px] leading-tight break-words sm:text-sm", row.kind === "mood" && "italic")}>
                {row.label}
              </span>
              <Cell count={row.backlog} want max={maxWant} />
              {STAR_COLUMNS.map((n) => (
                <Cell key={n} count={row.stars[n - 1]} max={maxStars} />
              ))}
              <span className="pr-1 text-right text-[13px] leading-tight tabular-nums sm:text-sm">
                {row.avgRating === null ? (
                  <span className="text-muted-foreground">–</span>
                ) : (
                  <>
                    {row.avgRating.toFixed(1)}
                    <span className="text-[11px] text-muted-foreground"> · {row.rated}</span>
                  </>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Cell({ count, max, want = false }: { count: number; max: number; want?: boolean }) {
  const step = countStep(count, max);
  // The Want column uses grey, so the backlog never reads as a rating.
  const grey = `color-mix(in oklab, var(--foreground) ${Math.round(8 + (count / max) * 30)}%, transparent)`;
  return (
    <span
      className={cn(
        "flex aspect-square items-center justify-center rounded-md text-[11px] font-medium tabular-nums",
        step === null && "bg-muted/60",
        want && "border border-dashed border-foreground/25",
      )}
      style={
        step === null
          ? undefined
          : want
            ? { background: grey }
            : { background: `var(--tm-${step})`, color: `var(--tm-${step}-ink)` }
      }
    >
      {count > 0 ? count : ""}
    </span>
  );
}

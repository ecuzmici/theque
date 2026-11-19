"use client";

import { Link } from "next-view-transitions";
import { useMemo, useState } from "react";

import { CoverImg } from "@/components/items/CoverImg";
import { cn } from "@/lib/utils";

import type { LabItem } from "../lab-data";

export type SlotView = {
  position: number;
  title: string;
  itemId: string | null;
  state: "done" | "want" | "missing";
  rating: number | null;
  cover: LabItem["cover"];
  remoteCover: string | null;
  color: string | null;
  hasFile: boolean;
  releaseDate: string | null;
  upcoming: boolean;
};

export type SeriesView = {
  name: string;
  author: string;
  slots: SlotView[];
  total: number;
  matched: boolean;
  lastDone: string | null;
};

type Filter = "going" | "fresh" | "complete" | "all";

function stage(series: SeriesView): Exclude<Filter, "all"> {
  const done = series.slots.filter((s) => s.state === "done").length;
  const released = series.slots.filter((s) => !s.upcoming).length;
  if (done === 0) return "fresh";
  if (done >= released) return "complete";
  return "going";
}

function goodreadsSearch(title: string, author: string) {
  return `https://www.goodreads.com/search?q=${encodeURIComponent(`${title} ${author}`)}`;
}

function Slot({ slot, isNext, author }: { slot: SlotView; isNext: boolean; author: string }) {
  const body = (
    <div
      className={cn(
        "relative aspect-[2/3] w-16 overflow-hidden rounded-md sm:w-20",
        slot.state === "done" && "shadow-lg ring-1 ring-black/10",
        slot.state === "want" && "opacity-80 ring-2 ring-sky-400/70",
        slot.state === "missing" && "border border-dashed border-border bg-muted/30",
        isNext && "ring-2 ring-amber-400 ring-offset-2 ring-offset-background",
      )}
      style={slot.state !== "missing" ? { background: slot.color ?? "#57534e" } : undefined}
    >
      {slot.cover ? (
        <CoverImg urls={slot.cover} className={cn("size-full object-cover", slot.state === "want" && "saturate-50")} />
      ) : slot.remoteCover ? (
        // eslint-disable-next-line @next/next/no-img-element -- prototype; Hardcover cover
        <img src={slot.remoteCover} alt="" loading="lazy" className="size-full object-cover opacity-35 grayscale" />
      ) : null}
      <span className="absolute top-1 left-1 rounded bg-black/60 px-1 font-mono text-[10px] text-white">{slot.position}</span>
      {slot.state === "done" ? (
        <span className="absolute right-1 bottom-1 rounded-full bg-emerald-500 px-1 text-[9px] text-white">✓</span>
      ) : null}
      {slot.upcoming ? (
        <span className="absolute inset-x-0 bottom-0 bg-amber-500 py-0.5 text-center text-[9px] font-medium text-black">
          {slot.releaseDate?.slice(0, 7)}
        </span>
      ) : null}
    </div>
  );
  const label = `${slot.position}. ${slot.title}`;
  return (
    <li className="w-16 shrink-0 sm:w-20" title={label}>
      {slot.itemId ? (
        <Link href={`/item/${slot.itemId}`}>{body}</Link>
      ) : (
        <a href={goodreadsSearch(slot.title, author)} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      )}
      <p className={cn("mt-1 line-clamp-2 text-[10px] leading-tight", slot.state === "missing" ? "text-muted-foreground" : "")}>
        {slot.title}
      </p>
    </li>
  );
}

export function SeriesTracker({ series }: { series: SeriesView[] }) {
  const [filter, setFilter] = useState<Filter>("going");

  const sorted = useMemo(
    () =>
      [...series]
        .filter((s) => filter === "all" || stage(s) === filter)
        .sort((a, b) => (b.lastDone ?? "").localeCompare(a.lastDone ?? "") || a.name.localeCompare(b.name)),
    [series, filter],
  );

  const counts = useMemo(() => {
    const c = { going: 0, fresh: 0, complete: 0, all: series.length };
    for (const s of series) c[stage(s)]++;
    return c;
  }, [series]);

  const upcoming = series.flatMap((s) => s.slots.filter((slot) => slot.upcoming).map((slot) => ({ series: s, slot })));

  return (
    <div className="space-y-6">
      {upcoming.length ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm">
          <p className="font-medium">Coming soon in your series</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {upcoming
              .sort((a, b) => (a.slot.releaseDate ?? "").localeCompare(b.slot.releaseDate ?? ""))
              .map(({ series: s, slot }) => (
                <li key={`${s.name}-${slot.position}`}>
                  <span className="text-foreground">{slot.title}</span> · {s.name} #{slot.position} · {slot.releaseDate}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <div role="radiogroup" aria-label="Series" className="flex w-fit flex-wrap gap-1 rounded-full bg-muted p-1">
        {(
          [
            ["going", "In progress"],
            ["fresh", "Not started"],
            ["complete", "Caught up"],
            ["all", "All"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="radio"
            aria-checked={filter === id}
            onClick={() => setFilter(id)}
            className={cn("min-h-8 rounded-full px-3 text-xs", filter === id ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            {label} <span className="opacity-60">{counts[id]}</span>
          </button>
        ))}
      </div>

      <ul className="space-y-4">
        {sorted.map((s) => {
          const done = s.slots.filter((slot) => slot.state === "done").length;
          const next = s.slots.find((slot) => slot.state !== "done" && !slot.upcoming);
          return (
            <li key={s.name} className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-heading text-xl tracking-tight">{s.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {s.author} · read {done} of {s.total}
                    {s.matched ? "" : " · not found on Hardcover, showing your books only"}
                  </p>
                </div>
                {next ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Next: </span>
                    {next.itemId ? (
                      <Link href={`/item/${next.itemId}`} className="font-medium underline decoration-amber-400 underline-offset-4">
                        #{next.position} {next.title}
                      </Link>
                    ) : (
                      <a href={goodreadsSearch(next.title, s.author)} target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-amber-400 underline-offset-4">
                        #{next.position} {next.title} ↗
                      </a>
                    )}
                    {next.hasFile ? <span className="ml-1.5 text-xs text-emerald-600 dark:text-emerald-400">on your Kobo</span> : null}
                    {next.state === "missing" ? <span className="ml-1.5 text-xs text-muted-foreground">not on your list</span> : null}
                  </p>
                ) : null}
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(done / Math.max(1, s.total)) * 100}%` }} />
              </div>
              <ol className="mt-4 flex gap-2.5 overflow-x-auto pb-1">
                {s.slots.map((slot) => (
                  <Slot key={slot.position} slot={slot} isNext={slot === next} author={s.author} />
                ))}
              </ol>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        Series data: Hardcover. Faded covers are books you do not have yet; they open a Goodreads search.
      </p>
    </div>
  );
}

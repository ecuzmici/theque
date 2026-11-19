"use client";

import { Link } from "next-view-transitions";
import { useEffect, useMemo, useState } from "react";

import { CoverImg } from "@/components/items/CoverImg";
import { cn } from "@/lib/utils";

import type { LabItem } from "../lab-data";

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Monday-first weekday index, 0-6. */
function weekday(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

function Heatmap({ year, items }: { year: number; items: LabItem[] }) {
  const byDay = useMemo(() => {
    const map = new Map<string, LabItem[]>();
    for (const item of items) {
      const key = dayKey(item.doneAt!);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [items]);

  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year, 11, 31);
  const offset = weekday(new Date(start));
  const weeks = Math.ceil((offset + (end - start) / DAY_MS + 1) / 7);

  const cells: Array<{ key: string; date: Date } | null> = [];
  for (let i = 0; i < weeks * 7; i++) {
    const t = start + (i - offset) * DAY_MS;
    cells.push(t < start || t > end ? null : { key: new Date(t).toISOString().slice(0, 10), date: new Date(t) });
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="inline-grid grid-flow-col grid-rows-7 gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks}, 12px)` }}>
        {cells.map((cell, i) => {
          if (!cell) return <span key={i} className="size-3" />;
          const done = byDay.get(cell.key) ?? [];
          const first = done[0];
          const label = `${cell.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}${
            done.length ? `: ${done.map((d) => d.title).join(", ")}` : ""
          }`;
          return first ? (
            <Link
              key={i}
              href={`/item/${first.id}`}
              title={label}
              className="size-3 rounded-[3px] ring-1 ring-black/20 transition-transform hover:scale-150"
              style={{ backgroundColor: first.color ?? (first.category === "books" ? "#d97706" : "#0284c7") }}
            />
          ) : (
            <span key={i} title={label} className="size-3 rounded-[3px] bg-muted" />
          );
        })}
      </div>
      <div className="mt-1.5 grid grid-flow-col text-[10px] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${weeks}, 15px)` }}>
        {Array.from({ length: weeks }, (_, w) => {
          // Label the first week that starts in a new month.
          const month = (week: number) => new Date(Math.max(start, start + (week * 7 - offset) * DAY_MS)).getUTCMonth();
          const show = w === 0 || month(w) !== month(w - 1);
          return <span key={w}>{show ? MONTHS[month(w)] : ""}</span>;
        })}
      </div>
    </div>
  );
}

function Goal({ year, books, now }: { year: number; books: LabItem[]; now: number }) {
  const [goal, setGoal] = useState(40);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("theque-lab-goal"));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is read after mount so hydration stays clean
      if (saved > 0) setGoal(saved);
    } catch {
      /* ignore */
    }
  }, []);
  const update = (value: number) => {
    setGoal(value);
    try {
      localStorage.setItem("theque-lab-goal", String(value));
    } catch {
      /* ignore */
    }
  };

  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1);
  const first = books.length ? Math.min(...books.map((b) => Date.parse(b.doneAt!))) : now;
  // Pace counts from the first finish of the year, so a mid-year start is fair.
  const from = Math.max(yearStart, first);
  const elapsed = Math.max(1, (Math.min(now, yearEnd) - from) / DAY_MS);
  const perDay = books.length / elapsed;
  const projected = Math.round(books.length + perDay * Math.max(0, (yearEnd - now) / DAY_MS));
  const pages = books.reduce((sum, b) => sum + (b.pages ?? 0), 0);
  const expectedShare = Math.min(1, (Math.min(now, yearEnd) - yearStart) / (yearEnd - yearStart));

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-xl tracking-tight">{year} reading goal</h2>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Goal
          <input
            type="number"
            min={1}
            max={500}
            value={goal}
            onChange={(e) => update(Math.max(1, Number(e.target.value) || 1))}
            className="h-9 w-20 rounded-md border border-input bg-background px-2 text-right text-foreground tabular-nums"
          />
          books
        </label>
      </div>
      <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (books.length / goal) * 100)}%` }} />
        <span
          aria-hidden
          className="absolute top-0 h-full w-0.5 bg-foreground/60"
          style={{ left: `${expectedShare * 100}%` }}
          title="Where you would be on a steady pace"
        />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Finished", `${books.length}`],
          ["On pace for", `${projected}`],
          ["Pages", pages.toLocaleString("en-US")],
          ["Pages a day", (pages / elapsed).toFixed(0)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 font-heading text-2xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        The line marks a steady pace to {goal}. {projected >= goal ? "You are ahead of it." : `${goal - projected} short at this pace.`}
      </p>
    </div>
  );
}

export function Journal({ items, now }: { items: LabItem[]; now: number }) {
  const years = useMemo(
    () => [...new Set(items.map((item) => Number(item.doneAt!.slice(0, 4))))].sort((a, b) => b - a),
    [items],
  );
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());
  const [onlyVerdicts, setOnlyVerdicts] = useState(false);

  const inYear = useMemo(
    () => items.filter((item) => item.doneAt!.startsWith(String(year))).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!)),
    [items, year],
  );
  const books = inYear.filter((item) => item.category === "books");
  const timeline = onlyVerdicts ? inYear.filter((item) => item.verdict) : inYear;

  const months = useMemo(() => {
    const groups = new Map<string, LabItem[]>();
    for (const item of timeline) {
      const key = item.doneAt!.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()];
  }, [timeline]);

  return (
    <div className="space-y-8">
      {years.length > 1 ? (
        <div className="flex gap-1.5">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={cn("min-h-8 rounded-full border px-3 text-xs", y === year ? "border-foreground" : "border-border text-muted-foreground")}
            >
              {y}
            </button>
          ))}
        </div>
      ) : null}

      <section aria-label="Finished by day">
        <Heatmap year={year} items={inYear} />
        <p className="mt-1 text-xs text-muted-foreground">Each square takes the colour of the cover you finished that day.</p>
      </section>

      <Goal year={year} books={books} now={now} />

      <section aria-labelledby="timeline">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="timeline" className="font-heading text-2xl tracking-tight">
            Diary
          </h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={onlyVerdicts} onChange={(e) => setOnlyVerdicts(e.target.checked)} className="size-4 accent-primary" />
            Only entries with a verdict
          </label>
        </div>
        <div className="mt-4 space-y-8">
          {months.map(([month, entries]) => (
            <div key={month}>
              <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)} · {entries.length}
              </h3>
              <ul className="mt-3 space-y-3">
                {entries.map((item) => (
                  <li key={item.id}>
                    <Link href={`/item/${item.id}`} className="flex gap-4 rounded-xl p-2 hover:bg-muted/60">
                      <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md bg-muted shadow">
                        {item.cover ? <CoverImg urls={item.cover} className="size-full object-cover" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-serif text-lg leading-tight">{item.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(item.doneAt!).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
                          {item.rating ? <span className="ml-2 text-amber-500">{"★".repeat(item.rating)}</span> : null}
                        </p>
                        {item.verdict ? (
                          <blockquote className="mt-2 border-l-2 border-primary/50 pl-3 font-serif text-[15px] leading-relaxed text-foreground/85 italic">
                            {item.verdict}
                          </blockquote>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

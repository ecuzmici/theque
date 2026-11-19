"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CoverImg } from "@/components/items/CoverImg";
import { BOOK_GENRES, MOODS, WATCH_GENRES } from "@/lib/taste/taste-lists";

import { hexToHsl, hueSortKey } from "../lab-color";
import type { LabItem } from "../lab-data";

const SLIDE_MS = 6500;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function hueName(hex: string | null): string {
  const hsl = hexToHsl(hex);
  if (!hsl || hsl.s < 0.12) return hsl && hsl.l < 0.3 ? "ink black" : "paper grey";
  const h = hsl.h;
  if (h < 15 || h >= 340) return "red";
  if (h < 45) return "amber";
  if (h < 70) return "gold";
  if (h < 160) return "green";
  if (h < 200) return "teal";
  if (h < 255) return "blue";
  if (h < 290) return "violet";
  return "rose";
}

function topBy<T>(values: T[]): Array<[T, number]> {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

const LABELS = new Map<string, string>([...BOOK_GENRES, ...WATCH_GENRES, ...MOODS].map((g) => [g.key, g.label]));

type Slide = { bg: string; body: React.ReactNode };

function Covers({ items, max = 9 }: { items: LabItem[]; max?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.slice(0, max).map((item) => (
        <div key={item.id} className="aspect-[2/3] overflow-hidden rounded-md shadow-lg ring-1 ring-white/10" style={{ background: item.color ?? "#333" }}>
          {item.cover ? <CoverImg urls={item.cover} className="size-full object-cover" /> : null}
        </div>
      ))}
    </div>
  );
}

function Big({ children }: { children: React.ReactNode }) {
  return <p className="font-heading text-7xl leading-none tracking-tight tabular-nums">{children}</p>;
}

export function Wrapped({ year, items }: { year: number; items: LabItem[] }) {
  const slides = useMemo<Slide[]>(() => {
    const books = items.filter((i) => i.category === "books");
    const films = items.filter((i) => i.category === "movies_and_tv");
    const pages = books.reduce((s, b) => s + (b.pages ?? 0), 0);
    const minutes = films.reduce((s, f) => s + (f.runtime ?? 0), 0);
    const fiveStars = items.filter((i) => i.rating === 5);
    const authors = topBy(books.flatMap((b) => b.authors.slice(0, 1)));
    const topAuthor = authors[0];
    const longest = [...books].filter((b) => b.pages).sort((a, b) => (b.pages ?? 0) - (a.pages ?? 0))[0];
    const months = topBy(items.map((i) => Number(i.doneAt!.slice(5, 7)) - 1));
    const busiest = months[0];
    const monthCounts = Array.from({ length: 12 }, (_, m) => items.filter((i) => Number(i.doneAt!.slice(5, 7)) - 1 === m).length);
    const maxMonth = Math.max(1, ...monthCounts);
    const verdict = [...items]
      .filter((i) => i.verdict && (i.rating ?? 0) >= 4)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.verdict!.length - a.verdict!.length))[0];
    const colors = items.map((i) => i.color).filter((c): c is string => !!c).sort((a, b) => hueSortKey(a) - hueSortKey(b));
    const colorOfYear = topBy(colors.map(hueName))[0]?.[0] ?? "amber";
    const genre = topBy(items.flatMap((i) => i.genres))[0];
    const mood = topBy(items.flatMap((i) => i.moods))[0];
    const stripes = `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(", ")})`;

    const list: Slide[] = [
      {
        bg: "radial-gradient(120% 80% at 50% 0%, #7c3aed 0%, #1c1917 70%)",
        body: (
          <>
            <p className="font-mono text-xs uppercase tracking-[0.3em] opacity-70">thèque · {year}</p>
            <Big>{items.length}</Big>
            <p className="text-2xl font-heading">stories finished this year.</p>
            <p className="text-sm opacity-70">{books.length} books and {films.length} films and shows. Tap to begin.</p>
          </>
        ),
      },
      {
        bg: "linear-gradient(160deg, #b45309, #1c1917 75%)",
        body: (
          <>
            <p className="text-lg opacity-80">You read</p>
            <Big>{pages.toLocaleString("en-US")}</Big>
            <p className="text-2xl font-heading">pages</p>
            <p className="text-sm opacity-70">across {books.length} books. That is a stack about {Math.round(pages * 0.01)} cm high.</p>
          </>
        ),
      },
      {
        bg: "linear-gradient(160deg, #0369a1, #0c0a09 75%)",
        body: (
          <>
            <p className="text-lg opacity-80">You watched</p>
            <Big>{Math.round(minutes / 60)}</Big>
            <p className="text-2xl font-heading">hours of film</p>
            <p className="text-sm opacity-70">{films.length} titles. The longest night: {[...films].sort((a, b) => (b.runtime ?? 0) - (a.runtime ?? 0))[0]?.title ?? "—"}.</p>
          </>
        ),
      },
      {
        bg: "linear-gradient(170deg, #a16207, #1c1917 70%)",
        body: (
          <>
            <p className="text-2xl font-heading">Your top shelf</p>
            <p className="text-sm opacity-70">{fiveStars.length} five-star finishes.</p>
            <Covers items={fiveStars} />
          </>
        ),
      },
    ];
    if (topAuthor) {
      list.push({
        bg: "linear-gradient(160deg, #be123c, #1c1917 75%)",
        body: (
          <>
            <p className="text-lg opacity-80">Your author of the year</p>
            <p className="font-heading text-5xl leading-tight">{topAuthor[0]}</p>
            <p className="text-sm opacity-70">{topAuthor[1]} books. Runners-up: {authors.slice(1, 3).map(([a]) => a).join(" and ") || "nobody close"}.</p>
            <Covers items={books.filter((b) => b.authors[0] === topAuthor[0])} max={6} />
          </>
        ),
      });
    }
    if (longest) {
      list.push({
        bg: "linear-gradient(160deg, #15803d, #0c0a09 75%)",
        body: (
          <>
            <p className="text-lg opacity-80">The longest climb</p>
            <p className="font-heading text-4xl leading-tight">{longest.title}</p>
            <Big>{longest.pages}</Big>
            <p className="text-sm opacity-70">pages{longest.rating ? `, and you gave it ${longest.rating} stars` : ""}.</p>
          </>
        ),
      });
    }
    if (busiest) {
      list.push({
        bg: "linear-gradient(160deg, #4338ca, #0c0a09 75%)",
        body: (
          <>
            <p className="text-lg opacity-80">Your busiest month</p>
            <p className="font-heading text-6xl">{MONTHS[busiest[0]]}</p>
            <p className="text-sm opacity-70">{busiest[1]} finishes.</p>
            <div className="flex h-28 items-end gap-1.5">
              {monthCounts.map((count, m) => (
                <div key={m} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="w-full rounded-sm bg-white/80" style={{ height: `${Math.max(2, (count / maxMonth) * 80)}%`, opacity: m === busiest[0] ? 1 : 0.35 }} />
                  <span className="text-[9px] opacity-60">{MONTHS[m]![0]}</span>
                </div>
              ))}
            </div>
          </>
        ),
      });
    }
    if (genre || mood) {
      list.push({
        bg: "linear-gradient(160deg, #6d28d9, #0c0a09 75%)",
        body: (
          <>
            <p className="text-lg opacity-80">Your year in one line</p>
            <p className="font-heading text-5xl leading-tight">
              {mood ? LABELS.get(mood[0]) : ""} {genre ? LABELS.get(genre[0])?.toLowerCase() : ""}
            </p>
            <p className="text-sm opacity-70">
              {genre ? `${genre[1]} finishes tagged ${LABELS.get(genre[0])}` : ""}
              {mood ? `, ${mood[1]} felt ${LABELS.get(mood[0])?.toLowerCase()}.` : "."}
            </p>
          </>
        ),
      });
    }
    if (verdict) {
      list.push({
        bg: "linear-gradient(160deg, #57534e, #0c0a09 75%)",
        body: (
          <>
            <p className="text-lg opacity-80">In your own words</p>
            <blockquote className="font-serif text-3xl leading-snug italic">“{verdict.verdict}”</blockquote>
            <p className="text-sm opacity-70">on {verdict.title}, {"★".repeat(verdict.rating ?? 0)}</p>
          </>
        ),
      });
    }
    list.push({
      bg: "#0c0a09",
      body: (
        <>
          <p className="text-lg opacity-80">The colour of your year</p>
          <p className="font-heading text-6xl capitalize">{colorOfYear}</p>
          <div className="h-40 w-full rounded-lg ring-1 ring-white/10" style={{ background: stripes }} />
          <p className="text-sm opacity-70">Every cover you finished, one stripe each, in colour order.</p>
        </>
      ),
    });
    list.push({
      bg: "radial-gradient(120% 80% at 50% 100%, #b45309 0%, #0c0a09 70%)",
      body: (
        <>
          <Big>{year + 1}</Big>
          <p className="text-2xl font-heading">is already on your shelf.</p>
          <p className="text-sm opacity-70">Tap to watch it again.</p>
        </>
      ),
    });
    return list;
  }, [items, year]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);

  const go = useCallback((delta: number) => {
    setIndex((i) => (i + delta + slides.length) % slides.length);
    setTick((t) => t + 1);
  }, [slides.length]);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => go(1), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [go, index, paused, tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing finished this year yet.</p>;
  const slide = slides[index]!;

  return (
    <div className="flex justify-center">
      <div
        className="relative aspect-[9/16] h-[min(42rem,calc(100dvh-8rem))] max-w-full overflow-hidden rounded-3xl text-white shadow-2xl ring-1 ring-black/40 select-none"
        style={{ background: slide.bg }}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        <div className="absolute inset-x-3 top-3 z-10 flex gap-1" aria-hidden>
          {slides.map((_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                key={i === index ? `${index}-${tick}` : i}
                className="h-full bg-white"
                style={{
                  width: i < index ? "100%" : i > index ? "0%" : undefined,
                  animation: i === index ? `lab-story ${SLIDE_MS}ms linear forwards` : undefined,
                  animationPlayState: paused ? "paused" : "running",
                }}
              />
            </div>
          ))}
        </div>
        <div key={index} className="flex h-full flex-col justify-center gap-4 p-8 [animation:lab-rise_500ms_ease-out]">
          {slide.body}
        </div>
        <button type="button" aria-label="Previous" className="absolute inset-y-0 left-0 w-1/3" onClick={() => go(-1)} />
        <button type="button" aria-label="Next" className="absolute inset-y-0 right-0 w-2/3" onClick={() => go(1)} />
      </div>
      <style>{`
        @keyframes lab-story { from { width: 0% } to { width: 100% } }
        @keyframes lab-rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { BOOK_GENRES, MOODS, WATCH_GENRES } from "@/lib/taste/taste-lists";
import { cn } from "@/lib/utils";

import { hashString } from "../lab-color";
import type { LabItem } from "../lab-data";

const W = 1000;
const H = 560;
const PAD = { left: 40, right: 20, top: 30, bottom: 50 };
const NOW = new Date().getFullYear() + 1;
const LABELS = new Map<string, string>([...BOOK_GENRES, ...WATCH_GENRES, ...MOODS].map((g) => [g.key, g.label]));

/** Recent years get more room than old ones: x follows the log of the distance from now. */
function xOf(year: number): number {
  const span = Math.log(NOW - 1800 + 1);
  const d = Math.log(Math.max(1, NOW - year) + 1);
  return PAD.left + (1 - d / span) * (W - PAD.left - PAD.right);
}

/** Done items sit at their rating; the backlog floats in a band at the bottom. */
function yOf(item: LabItem): number {
  const jitter = ((hashString(item.id) % 1000) / 1000 - 0.5) * 0.7;
  const band = (H - PAD.top - PAD.bottom) / 6;
  const level = item.status === "done" && item.rating ? item.rating : 0;
  return H - PAD.bottom - (level + 0.5 + jitter) * band;
}

function radius(item: LabItem): number {
  const size = item.category === "books" ? (item.pages ?? 300) / 300 : (item.runtime ?? 110) / 110;
  return Math.max(2.5, Math.min(9, 2.5 + size * 2.6));
}

type Mode = "genre" | "creator";

export function TasteMap({ items }: { items: LabItem[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<"all" | "books" | "movies_and_tv">("all");
  const [mode, setMode] = useState<Mode>("genre");
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<LabItem | null>(null);

  const visible = useMemo(() => items.filter((i) => kind === "all" || i.category === kind), [items, kind]);

  const facets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of visible) {
      const keys = mode === "genre" ? [...item.genres, ...item.moods] : [...item.authors.slice(0, 1), ...item.directors.slice(0, 1)];
      for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 18);
  }, [visible, mode]);

  const inFocus = (item: LabItem) =>
    !focus ||
    (mode === "genre"
      ? item.genres.includes(focus) || item.moods.includes(focus)
      : item.authors[0] === focus || item.directors[0] === focus);

  const constellation = useMemo(() => {
    if (!focus) return "";
    return visible
      .filter(inFocus)
      .map((item) => ({ x: xOf(item.year!), y: yOf(item) }))
      .sort((a, b) => a.x - b.x)
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    // inFocus depends on focus and mode only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, focus, mode]);

  const bands = ["Not yet", "★", "★★", "★★★", "★★★★", "★★★★★"];
  const ticks = [1850, 1950, 1980, 2000, 2010, 2020, 2025];
  const band = (H - PAD.top - PAD.bottom) / 6;

  // A fixed field of faint background stars.
  const dust = useMemo(
    () =>
      Array.from({ length: 140 }, (_, i) => {
        const h = hashString(`dust-${i}`);
        return { x: (h % W), y: ((h >>> 10) % H), r: ((h >>> 20) % 10) / 10 + 0.2 };
      }),
    [],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Items" className="flex gap-1 rounded-full bg-muted p-1">
          {(
            [
              ["all", "Everything"],
              ["books", "Books"],
              ["movies_and_tv", "Films"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="radio"
              aria-checked={kind === id}
              onClick={() => {
                setKind(id);
                setFocus(null);
              }}
              className={cn("min-h-8 rounded-full px-3 text-xs", kind === id ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Constellations" className="flex gap-1 rounded-full bg-muted p-1">
          {(
            [
              ["genre", "Genres & moods"],
              ["creator", "Authors & directors"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="radio"
              aria-checked={mode === id}
              onClick={() => {
                setMode(id);
                setFocus(null);
              }}
              className={cn("min-h-8 rounded-full px-3 text-xs", mode === id ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {facets.map(([key, count]) => (
          <button
            key={key}
            onClick={() => setFocus(focus === key ? null : key)}
            className={cn(
              "min-h-8 rounded-full border px-2.5 text-xs",
              focus === key ? "border-amber-400 bg-amber-400/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {LABELS.get(key) ?? key} <span className="opacity-60">{count}</span>
          </button>
        ))}
      </div>

      <div className="relative mt-5 overflow-hidden rounded-2xl bg-[#07080f] ring-1 ring-white/10">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Your library by era and rating">
          <defs>
            <radialGradient id="lab-glow">
              <stop offset="0%" stopColor="white" stopOpacity="0.9" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
          </defs>
          {dust.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="white" opacity={0.18} />
          ))}
          {bands.map((label, i) => (
            <g key={label}>
              <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom - i * band} y2={H - PAD.bottom - i * band} stroke="white" strokeOpacity={0.06} />
              <text x={6} y={H - PAD.bottom - (i + 0.5) * band + 4} fill="white" fillOpacity={0.4} fontSize={10}>
                {i === 0 ? "Later" : label}
              </text>
            </g>
          ))}
          {ticks.map((year) => (
            <text key={year} x={xOf(year)} y={H - 18} fill="white" fillOpacity={0.45} fontSize={11} textAnchor="middle">
              {year}
            </text>
          ))}
          {constellation ? (
            <path d={constellation} fill="none" stroke="#fbbf24" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 4" />
          ) : null}
          {visible.map((item) => {
            const x = xOf(item.year!);
            const y = yOf(item);
            const r = radius(item);
            const lit = inFocus(item);
            return (
              <g
                key={item.id}
                className="cursor-pointer"
                opacity={lit ? 1 : 0.12}
                onMouseEnter={() => setHover(item)}
                onMouseLeave={() => setHover(null)}
                onClick={() => router.push(`/item/${item.id}`)}
              >
                {item.rating === 5 && lit ? <circle cx={x} cy={y} r={r * 3} fill="url(#lab-glow)" opacity={0.35} /> : null}
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={item.color ?? "#e7e5e4"}
                  stroke={item.status === "done" ? "white" : "white"}
                  strokeOpacity={item.status === "done" ? 0.7 : 0.25}
                  strokeDasharray={item.status === "done" ? undefined : "1.5 1.5"}
                />
              </g>
            );
          })}
        </svg>
        {hover ? (
          <div className="pointer-events-none absolute top-3 right-3 max-w-64 rounded-lg bg-black/80 px-3 py-2 text-xs text-white ring-1 ring-white/15">
            <p className="font-serif text-sm leading-tight">{hover.title}</p>
            <p className="mt-0.5 opacity-70">
              {hover.year} · {hover.authors[0] ?? hover.directors[0] ?? ""}
              {hover.rating ? ` · ${"★".repeat(hover.rating)}` : hover.status === "done" ? "" : " · on your list"}
            </p>
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Left to right: older to newer (recent years get more room). Bottom band: not finished yet. Size: length. A glow marks 5
        stars. Pick a chip to draw its constellation.
      </p>
    </div>
  );
}

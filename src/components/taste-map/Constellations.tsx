"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { decadeBuckets, packGrid, spanningTree } from "@/lib/taste-map/taste-map";
import { cn } from "@/lib/utils";

import type { MapStar, TasteMapData } from "./types";

const BANDS = [
  { key: "5", label: "★★★★★", short: "5★" },
  { key: "4", label: "★★★★", short: "4★" },
  { key: "3", label: "★★★", short: "3★" },
  { key: "2", label: "★★", short: "2★" },
  { key: "1", label: "★", short: "1★" },
  { key: "done", label: "Unrated", short: "Unrated" },
  { key: "later", label: "Want", short: "Want" },
] as const;

function bandOf(star: MapStar): string {
  if (!star.done) return "later";
  return star.stars ? String(star.stars) : "done";
}

type Placed = { star: MapStar; x: number; y: number; r: number };
type Layout = {
  width: number;
  height: number;
  placed: Placed[];
  bandTicks: { label: string; at: number; size: number }[];
  decadeTicks: { label: string; at: number; size: number }[];
};

/**
 * Lays the stars out in cells: one axis is the decade, the other the rating
 * band. Each cell packs its stars in a grid in year order, so the same year
 * never stacks into a column. Cell size follows the square root of the count.
 */
function layout(stars: MapStar[], orientation: "wide" | "tall"): Layout {
  const wide = orientation === "wide";
  const buckets = decadeBuckets(stars);
  const bandCount = new Map<string, number>();
  for (const s of stars) bandCount.set(bandOf(s), (bandCount.get(bandOf(s)) ?? 0) + 1);
  // Tall: the Unrated label is long, so its column gets more room.
  const bandWeight = BANDS.map((b) =>
    wide
      ? Math.max(0.6, Math.sqrt(bandCount.get(b.key) ?? 0))
      : Math.min(5, Math.max(b.key === "done" ? 3 : 1.8, Math.sqrt(bandCount.get(b.key) ?? 0))),
  );
  const decadeWeight = buckets.map((b) => Math.max(0.6, Math.sqrt(b.items.length)));

  const width = wide ? 1000 : 360;
  const pad = wide ? { left: 78, right: 8, top: 8, bottom: 30 } : { left: 50, right: 4, top: 26, bottom: 4 };
  const height = wide ? 500 : Math.max(420, 26 + buckets.length * 70);
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  // Each span gets `min` pixels first, then a share of the rest by weight, so
  // a small band always has room for its dots inside the cell inset.
  const spans = (weights: number[], total: number, start: number, min: number) => {
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const floor = Math.min(min, total / Math.max(1, weights.length));
    const rest = Math.max(0, total - floor * weights.length);
    let at = start;
    return weights.map((w) => {
      const size = floor + (w / sum) * rest;
      const span = { at, size };
      at += size;
      return span;
    });
  };
  // Wide: decades across, bands down. Tall: bands across, decades down.
  const decadeSpans = wide ? spans(decadeWeight, plotW, pad.left, 28) : spans(decadeWeight, plotH, pad.top, 24);
  const bandSpans = wide ? spans(bandWeight, plotH, pad.top, 24) : spans(bandWeight, plotW, pad.left, 22);

  const placed: Placed[] = [];
  buckets.forEach((bucket, di) => {
    BANDS.forEach((band, bi) => {
      const cell = bucket.items
        .filter((s) => bandOf(s) === band.key)
        .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.id.localeCompare(b.id));
      if (!cell.length) return;
      const d = decadeSpans[di]!;
      const b = bandSpans[bi]!;
      const box = wide
        ? { x: d.at, y: b.at, w: d.size, h: b.size }
        : { x: b.at, y: d.at, w: b.size, h: d.size };
      const inset = 3;
      const dots = packGrid(cell.length, { width: box.w - inset * 2, height: box.h - inset * 2, maxR: wide ? 7 : 5 });
      cell.forEach((star, i) => {
        const p = dots[i];
        if (!p) return;
        placed.push({ star, x: box.x + inset + p.x, y: box.y + inset + p.y, r: Math.max(1.5, p.r) });
      });
    });
  });

  return {
    width,
    height,
    placed,
    bandTicks: BANDS.map((b, i) => ({ label: wide ? b.label : b.short, ...bandSpans[i]! })),
    decadeTicks: buckets.map((b, i) => ({
      label: (wide ? b.label : b.label.replace(/^(\d\d)(\d\d)s$/, "’$2s")).replace("Earlier", "Older"),
      ...decadeSpans[i]!,
    })),
  };
}

/** Variant 2: the scatter as a sky, in decade and rating cells, with lines for one genre. */
export function Constellations({ data }: { data: TasteMapData }) {
  const stars = useMemo(() => data.stars.filter((s) => s.year), [data.stars]);
  const facets = data.stats.slice(0, 10);
  // The first focus comes from the chips on screen, so it always has a chip.
  const firstGenre = (facets.find((s) => s.kind === "genre") ?? facets[0])?.key ?? null;
  const [focus, setFocus] = useState<string | null>(firstGenre);
  const [picked, setPicked] = useState<MapStar | null>(null);
  const wide = useMemo(() => layout(stars, "wide"), [stars]);
  const tall = useMemo(() => layout(stars, "tall"), [stars]);
  const undated = data.stars.length - stars.length;
  const focusStat = data.stats.find((s) => s.key === focus) ?? null;

  return (
    <div className="space-y-3">
      <div
        className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="Draw the lines for"
      >
        {facets.map((f) => {
          const active = f.key === focus;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFocus(active ? null : f.key)}
              className={cn(
                "inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition pointer-coarse:min-h-[var(--tap-target-min)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-foreground bg-foreground/[0.07] text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
                f.kind === "mood" && "italic",
              )}
            >
              {f.label}
              <span className="text-[11px] tabular-nums text-muted-foreground/70 not-italic">{f.count}</span>
            </button>
          );
        })}
      </div>

      <p className="flex flex-wrap justify-between gap-x-4 text-xs text-muted-foreground">
        <span className="sm:hidden">Across: your rating, best on the left. Down: decade.</span>
        <span className="hidden sm:inline">Across: decade. Down: your rating, best at the top.</span>
        {undated ? <span>{undated} without a year are not shown.</span> : null}
      </p>

      <div className="overflow-hidden rounded-2xl bg-[#0b0d16] ring-1 ring-white/10">
        <Sky className="hidden sm:block" layout={wide} focus={focus} picked={picked} onPick={setPicked} orientation="wide" />
        <Sky className="sm:hidden" layout={tall} focus={focus} picked={picked} onPick={setPicked} orientation="tall" />
      </div>

      <div className="min-h-16 rounded-2xl border border-border bg-card p-4 text-sm" aria-live="polite">
        {picked ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-heading text-lg">{picked.title}</p>
              <p className="text-muted-foreground">
                {[picked.year, picked.creator, picked.stars ? "★".repeat(picked.stars) : picked.done ? "finished" : "on your list"]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/item/${picked.id}`} />}>
              Open
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground">
            {focusStat ? (
              <>
                <span className="text-foreground">{focusStat.label}</span>: {focusStat.count} saved, {focusStat.done} finished
                {focusStat.avgRating ? `, ${focusStat.avgRating.toFixed(1)}★ on average` : ""}.{" "}
              </>
            ) : null}
            Each dot is a book or film, colored by its cover. Tap one to see it.
          </p>
        )}
      </div>
    </div>
  );
}

function Sky({
  className,
  layout: l,
  focus,
  picked,
  onPick,
  orientation,
}: {
  className?: string;
  layout: Layout;
  focus: string | null;
  picked: MapStar | null;
  onPick: (star: MapStar | null) => void;
  orientation: "wide" | "tall";
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wide = orientation === "wide";
  const lit = (s: MapStar) => !focus || s.tags.includes(focus);

  const lines = useMemo(() => {
    if (!focus) return [];
    const pts = l.placed.filter((p) => p.star.tags.includes(focus));
    return spanningTree(pts).map(([a, b]) => [pts[a]!, pts[b]!] as const);
  }, [l, focus]);

  // Picks the nearest star within 24 px of the tap, so small dots stay easy to hit.
  function pickAt(clientX: number, clientY: number) {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    const scale = 1 / ctm.a;
    let best: Placed | null = null;
    let bestD = 24 * scale;
    for (const p of l.placed) {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    onPick(best?.star ?? null);
  }

  const font = wide ? 13 : 10;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${l.width} ${l.height}`}
      className={cn("block h-auto w-full cursor-pointer select-none", className)}
      role="img"
      aria-label="Your books and films by decade and rating"
      onClick={(e) => pickAt(e.clientX, e.clientY)}
    >
      {l.bandTicks.map((t, i) => (
        <g key={t.label}>
          {wide ? (
            <>
              {i ? <line x1={70} x2={l.width} y1={t.at} y2={t.at} stroke="white" strokeOpacity={0.08} /> : null}
              <text x={8} y={t.at + t.size / 2 + 4} fill="white" fillOpacity={0.55} fontSize={font}>
                {t.label}
              </text>
            </>
          ) : (
            <>
              {i ? <line y1={20} y2={l.height} x1={t.at} x2={t.at} stroke="white" strokeOpacity={0.08} /> : null}
              <text x={t.at + t.size / 2} y={16} fill="white" fillOpacity={0.55} fontSize={font} textAnchor="middle">
                {t.label}
              </text>
            </>
          )}
        </g>
      ))}
      {l.decadeTicks.map((t, i) => (
        <g key={t.label}>
          {wide ? (
            <>
              {i ? <line x1={t.at} x2={t.at} y1={0} y2={l.height - 24} stroke="white" strokeOpacity={0.08} /> : null}
              <text x={t.at + t.size / 2} y={l.height - 9} fill="white" fillOpacity={0.55} fontSize={font} textAnchor="middle">
                {t.label}
              </text>
            </>
          ) : (
            <>
              {i ? <line y1={t.at} y2={t.at} x1={0} x2={l.width} stroke="white" strokeOpacity={0.08} /> : null}
              <text x={6} y={t.at + t.size / 2 + 4} fill="white" fillOpacity={0.55} fontSize={font}>
                {t.label}
              </text>
            </>
          )}
        </g>
      ))}
      {lines.map(([a, b]) => (
        <line
          key={`${a.star.id}-${b.star.id}`}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="white"
          strokeOpacity={0.45}
          strokeWidth={wide ? 1.2 : 0.8}
        />
      ))}
      {l.placed.map((p) => {
        const on = lit(p.star);
        const isPicked = picked?.id === p.star.id;
        return (
          <circle
            key={p.star.id}
            cx={p.x}
            cy={p.y}
            r={isPicked ? p.r + 2 : p.r}
            fill={p.star.color ?? "#d6d3d1"}
            stroke="white"
            strokeOpacity={isPicked ? 1 : p.star.done ? 0.6 : 0.25}
            strokeWidth={isPicked ? 2 : 1}
            opacity={on ? 1 : 0.14}
          >
            <title>{`${p.star.title}${p.star.year ? `, ${p.star.year}` : ""}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

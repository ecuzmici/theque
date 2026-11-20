"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { libraryHref, type PlacedNode, type TagEdge, type TagStat } from "@/lib/taste-map/taste-map";
import { cn } from "@/lib/utils";

import { formatRating, RATING_SCALE_VARS, RATING_STEPS, ratingFill } from "./scale";
import type { TasteMapData } from "./types";

/** Variant 1: genres and moods as a graph. Size is the count, color the mean rating. */
export function GenreGraph({ data }: { data: TasteMapData }) {
  const { stats, edges, wide, tall } = data.graph;
  const [focus, setFocus] = useState<string | null>(null);
  const byKey = useMemo(() => new Map(stats.map((s) => [s.key, s])), [stats]);
  const focused = focus ? byKey.get(focus) ?? null : null;

  const neighbours = useMemo(() => {
    if (!focus) return [];
    return edges
      .filter((e) => e.a === focus || e.b === focus)
      .map((e) => ({ stat: byKey.get(e.a === focus ? e.b : e.a)!, weight: e.weight }))
      .filter((n) => n.stat)
      .sort((x, y) => y.weight - x.weight);
  }, [edges, focus, byKey]);

  const best = [...stats].filter((s) => s.rated >= 3).sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))[0];
  const most = stats[0];

  const toggle = (key: string) => setFocus((cur) => (cur === key ? null : key));

  return (
    <div className={cn("space-y-4", RATING_SCALE_VARS)}>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <GraphSvg
          className="hidden sm:block"
          nodes={wide}
          width={1000}
          height={560}
          font={14}
          edges={edges}
          byKey={byKey}
          focus={focus}
          onPick={toggle}
        />
        <GraphSvg
          className="sm:hidden"
          nodes={tall}
          width={360}
          height={500}
          font={10.5}
          edges={edges}
          byKey={byKey}
          focus={focus}
          onPick={toggle}
        />
      </div>

      <Legend />

      <div className="rounded-2xl border border-border bg-card p-4" aria-live="polite">
        {focused ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-xl">{focused.label}</p>
                <p className="text-sm text-muted-foreground">
                  {focused.count} saved · {focused.done} finished · {formatRating(focused.avgRating)}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFocus(null)}>
                Clear
              </Button>
            </div>
            {neighbours.length ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Often with </span>
                {neighbours.map((n, i) => (
                  <span key={n.stat.key}>
                    {i ? ", " : ""}
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => setFocus(n.stat.key)}>
                      {n.stat.label}
                    </button>{" "}
                    <span className="text-muted-foreground tabular-nums">({n.weight})</span>
                  </span>
                ))}
              </p>
            ) : null}
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={libraryHref(focused)} />}>
              Open on the shelf
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {most ? (
              <>
                You save <span className="text-foreground">{most.label}</span> most ({most.count}).{" "}
              </>
            ) : null}
            {best ? (
              <>
                You rate <span className="text-foreground">{best.label}</span> highest ({formatRating(best.avgRating)}).{" "}
              </>
            ) : null}
            Tap a circle to see what it goes with.
          </p>
        )}
      </div>
    </div>
  );
}

function GraphSvg({
  className,
  nodes,
  width,
  height,
  font,
  edges,
  byKey,
  focus,
  onPick,
}: {
  className?: string;
  nodes: PlacedNode[];
  width: number;
  height: number;
  font: number;
  edges: TagEdge[];
  byKey: Map<string, TagStat>;
  focus: string | null;
  onPick: (key: string) => void;
}) {
  const pos = new Map(nodes.map((n) => [n.key, n]));
  const maxW = Math.max(1, ...edges.map((e) => e.weight));
  const linked = new Set<string>(focus ? [focus] : []);
  for (const e of edges) {
    if (e.a === focus) linked.add(e.b);
    if (e.b === focus) linked.add(e.a);
  }
  const lit = (key: string) => !focus || linked.has(key);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block h-auto w-full", className)}
      role="img"
      aria-label="Genres and moods, linked when they share items"
    >
      {edges.map((e) => {
        const a = pos.get(e.a);
        const b = pos.get(e.b);
        if (!a || !b) return null;
        const on = focus ? e.a === focus || e.b === focus : true;
        return (
          <line
            key={`${e.a}-${e.b}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className="stroke-foreground"
            strokeOpacity={on ? (focus ? 0.55 : 0.18) : 0.04}
            strokeWidth={1 + (e.weight / maxW) * (font / 3)}
          />
        );
      })}
      {nodes.map((n) => {
        const stat = byKey.get(n.key)!;
        const mood = stat.kind === "mood";
        return (
          <g
            key={n.key}
            role="button"
            tabIndex={0}
            aria-label={`${stat.label}: ${stat.count} saved, ${formatRating(stat.avgRating)}`}
            aria-pressed={focus === n.key}
            className="cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-ring"
            opacity={lit(n.key) ? 1 : 0.2}
            onClick={() => onPick(n.key)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onPick(n.key);
              }
            }}
          >
            {/* A larger clear circle gives small nodes a bigger hit area. */}
            <circle cx={n.x} cy={n.y} r={Math.max(n.r, 22)} fill="transparent" strokeWidth={3} />
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={ratingFill(stat.avgRating)}
              className={cn("stroke-card", focus === n.key && "stroke-foreground")}
              strokeWidth={focus === n.key ? 2.5 : 2}
            />
            {mood ? (
              <circle
                cx={n.x}
                cy={n.y}
                r={n.r + 3}
                fill="none"
                className="stroke-foreground"
                strokeOpacity={0.45}
                strokeDasharray="2 3"
              />
            ) : null}
            <text
              x={n.x}
              y={n.y + n.r + font + 2}
              textAnchor="middle"
              fontSize={font}
              className={cn("fill-foreground", mood && "italic")}
              paintOrder="stroke"
              stroke="var(--card)"
              strokeWidth={3}
            >
              {stat.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        Mean rating
        {RATING_STEPS.map((label, i) => (
          <span key={label} title={label} className="inline-block size-3 rounded-sm" style={{ background: `var(--tm-${i})` }} />
        ))}
        <span className="tabular-nums">low to high</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-3 rounded-full" style={{ background: "var(--tm-none)" }} />
        no ratings
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-3 rounded-full border border-dashed border-foreground/50" />
        <i>mood</i>
      </span>
      <span>Size: items saved. Line: saved together.</span>
    </div>
  );
}

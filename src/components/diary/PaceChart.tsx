"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

import type { Pace } from "@/lib/diary/diary";

const DAY_MS = 86_400_000;
const TICK_MONTHS = [0, 3, 6, 9];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function niceMax(value: number): number {
  const step = value > 50 ? 10 : 5;
  return Math.max(step, Math.ceil((value * 1.08) / step) * step);
}

function countOn(pace: Pace, day: number): number {
  let count = 0;
  for (const point of pace.points) {
    if (point.day > day) break;
    count = point.count;
  }
  return count;
}

function dateOf(year: number, day: number): string {
  return new Date(Date.UTC(year, 0, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Books finished so far (a step line) against a steady pace to the goal
 * (a straight reference line). One y-axis: books.
 */
export function PaceChart({ pace, year }: { pace: Pace; year: number }) {
  const [day, setDay] = useState<number | null>(null);
  const { daysInYear, today, goal, finished } = pace;
  const yMax = niceMax(Math.max(goal, finished));

  // Percent positions, so the HTML labels and the SVG agree at any width.
  const x = (d: number) => (d / daysInYear) * 100;
  const y = (n: number) => 100 - (n / yMax) * 100;

  let path = "M0,100";
  let prev = 0;
  for (const point of pace.points) {
    path += ` L${x(point.day)},${y(prev)} L${x(point.day)},${y(point.count)}`;
    prev = point.count;
  }
  path += ` L${x(today)},${y(finished)}`;
  const area = `${path} L${x(today)},100 Z`;

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const share = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setDay(Math.max(1, Math.round(share * daysInYear)));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = day ?? Math.max(1, today);
    const next =
      e.key === "ArrowLeft" ? current - 7 : e.key === "ArrowRight" ? current + 7 : e.key === "Home" ? 1 : e.key === "End" ? daysInYear : null;
    if (next == null) return;
    e.preventDefault();
    setDay(Math.min(daysInYear, Math.max(1, next)));
  }

  const steadyAt = (d: number) => Math.floor((goal * d) / daysInYear);
  const ticks = TICK_MONTHS.map((m) => ({
    label: MONTH_SHORT[m]!,
    day: (Date.UTC(year, m, 1) - Date.UTC(year, 0, 1)) / DAY_MS,
  }));

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-primary" aria-hidden />
          Finished
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-4 bg-muted-foreground" aria-hidden />
          Steady pace to {goal}
        </span>
      </div>
      <div className="flex gap-2">
        {/* y-axis: 0 and the goal */}
        <div className="relative h-40 w-6 shrink-0 self-start text-right sm:h-52 text-[11px] tabular-nums text-muted-foreground" aria-hidden>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: `${y(goal)}%` }}>
            {goal}
          </span>
          <span className="absolute right-0 bottom-0 translate-y-1/2">0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            role="img"
            tabIndex={0}
            aria-label={`${finished} books finished by ${dateOf(year, Math.max(1, today))}. A steady pace to ${goal} needs ${pace.expected}.`}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setDay(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setDay(null)}
            className="relative h-40 touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-52"
          >
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
              <line x1="0" x2="100" y1="100" y2="100" className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <line x1="0" x2="100" y1={y(goal)} y2={y(goal)} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <line
                x1="0"
                y1="100"
                x2="100"
                y2={y(goal)}
                className="stroke-muted-foreground"
                strokeWidth="1.25"
                vectorEffect="non-scaling-stroke"
              />
              <path d={area} className="fill-primary/10" />
              <path
                d={path}
                fill="none"
                className="stroke-primary"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {day != null ? (
                <line x1={x(day)} x2={x(day)} y1="0" y2="100" className="stroke-foreground/40" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              ) : null}
            </svg>

            {/* End marker and its label */}
            <span
              aria-hidden
              className="absolute size-2.5 -translate-1/2 rounded-full bg-primary ring-2 ring-card"
              style={{ left: `${x(today)}%`, top: `${y(finished)}%` }}
            />
            {day == null ? (
              <span
                aria-hidden
                className="absolute -translate-y-[130%] text-xs font-medium tabular-nums text-foreground"
                style={
                  x(today) > 80
                    ? { right: `${100 - x(today)}%`, top: `${y(finished)}%` }
                    : { left: `${x(today)}%`, top: `${y(finished)}%` }
                }
              >
                {finished}
              </span>
            ) : null}

            {day != null ? (
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 z-10 w-max rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
                style={
                  x(day) > 55
                    ? { right: `calc(${100 - x(day)}% + 8px)` }
                    : { left: `calc(${x(day)}% + 8px)` }
                }
              >
                <p className="text-muted-foreground">{dateOf(year, day)}</p>
                {day <= today ? (
                  <p className="mt-0.5 flex items-center gap-1.5">
                    <span className="h-0.5 w-3 rounded-full bg-primary" />
                    <span className="font-semibold tabular-nums">{countOn(pace, day)}</span>
                    <span className="text-muted-foreground">finished</span>
                  </p>
                ) : null}
                <p className="mt-0.5 flex items-center gap-1.5">
                  <span className="h-px w-3 bg-muted-foreground" />
                  <span className="font-semibold tabular-nums">{steadyAt(day)}</span>
                  <span className="text-muted-foreground">steady pace</span>
                </p>
              </div>
            ) : null}
          </div>
          <div className="relative mt-1.5 h-4 text-[11px] text-muted-foreground" aria-hidden>
            {ticks.map((tick) => (
              <span key={tick.label} className="absolute" style={{ left: `${x(tick.day)}%` }}>
                {tick.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

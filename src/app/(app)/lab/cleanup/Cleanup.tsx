"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CoverImg } from "@/components/items/CoverImg";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { LabItem } from "../lab-data";

const AGES = [
  { days: 60, label: "2 months" },
  { days: 120, label: "4 months" },
  { days: 180, label: "6 months" },
];

const SWIPE_PX = 110;

function ago(now: number, iso: string): string {
  const days = Math.round((now - Date.parse(iso)) / 86_400_000);
  if (days < 45) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

export function Cleanup({ items, now }: { items: LabItem[]; now: number }) {
  const [age, setAge] = useState(AGES[1]!.days);
  const [decisions, setDecisions] = useState<Record<string, "keep" | "go">>({});
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);

  const pool = useMemo(() => items.filter((i) => now - Date.parse(i.createdAt) >= age * 86_400_000), [items, age, now]);
  const queue = pool.filter((i) => !decisions[i.id]);
  const current = queue[0];
  const kept = pool.filter((i) => decisions[i.id] === "keep");
  const gone = pool.filter((i) => decisions[i.id] === "go");

  const decide = (choice: "keep" | "go") => {
    if (!current) return;
    setDecisions((d) => ({ ...d, [current.id]: choice }));
    setDx(0);
  };

  const undo = () => {
    const last = [...pool].reverse().find((i) => decisions[i.id]);
    if (!last) return;
    setDecisions((d) => {
      const next = { ...d };
      delete next[last.id];
      return next;
    });
  };

  // The key handler reads the latest `decide` through a ref, so it subscribes one time.
  const decideRef = useRef(decide);
  useEffect(() => {
    decideRef.current = decide;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") decideRef.current("go");
      if (e.key === "ArrowRight") decideRef.current("keep");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Saved more than</span>
        {AGES.map((a) => (
          <button
            key={a.days}
            onClick={() => setAge(a.days)}
            className={cn("min-h-8 rounded-full border px-3 text-xs", age === a.days ? "border-foreground" : "border-border text-muted-foreground")}
          >
            {a.label} ago
          </button>
        ))}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {pool.length - queue.length} / {pool.length}
        </span>
      </div>

      {current ? (
        <div className="relative mx-auto h-[30rem] w-full max-w-sm select-none">
          {queue.slice(1, 3).reverse().map((item, i) => (
            <div
              key={item.id}
              aria-hidden
              className="absolute inset-0 rounded-3xl border border-border bg-card shadow-lg"
              style={{ transform: `translateY(${(2 - i) * 10}px) scale(${0.94 + i * 0.03})` }}
            />
          ))}
          <div
            className="absolute inset-0 touch-none overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
            style={{ transform: `translateX(${dx}px) rotate(${dx / 20}deg)`, transition: dragging ? "none" : "transform 200ms" }}
            onPointerDown={(e) => {
              start.current = e.clientX;
              setDragging(true);
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (start.current !== null) setDx(e.clientX - start.current);
            }}
            onPointerUp={() => {
              start.current = null;
              setDragging(false);
              if (dx > SWIPE_PX) decide("keep");
              else if (dx < -SWIPE_PX) decide("go");
              else setDx(0);
            }}
          >
            <div className="h-72 w-full" style={{ background: current.color ?? "#444" }}>
              {current.cover ? <CoverImg urls={current.cover} className="pointer-events-none size-full object-contain" draggable={false} /> : null}
            </div>
            <div className="p-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {current.category === "books" ? "Book" : "Film"} · saved {ago(now, current.createdAt)}
              </p>
              <p className="mt-1 font-heading text-2xl leading-tight">{current.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{current.authors[0] ?? current.directors[0] ?? ""}</p>
            </div>
            <span
              className="absolute top-5 left-5 rounded-lg border-2 border-emerald-400 px-2 py-1 text-sm font-bold text-emerald-400 uppercase"
              style={{ opacity: Math.max(0, dx / SWIPE_PX) }}
            >
              Keep
            </span>
            <span
              className="absolute top-5 right-5 rounded-lg border-2 border-rose-400 px-2 py-1 text-sm font-bold text-rose-400 uppercase"
              style={{ opacity: Math.max(0, -dx / SWIPE_PX) }}
            >
              Let go
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-border bg-card/60 p-6 text-center">
          <p className="font-heading text-2xl">All sorted</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You kept {kept.length} and let go of {gone.length}. The real version would dismiss those {gone.length}, so they leave Want,
            Up next and the recommender’s list.
          </p>
        </div>
      )}

      <div className="flex justify-center gap-3">
        <Button variant="outline" size="lg" onClick={() => decide("go")} disabled={!current} className="min-w-28 text-rose-500">
          ← Let go
        </Button>
        <Button variant="ghost" size="lg" onClick={undo}>
          Undo
        </Button>
        <Button variant="outline" size="lg" onClick={() => decide("keep")} disabled={!current} className="min-w-28 text-emerald-500">
          Keep →
        </Button>
      </div>

      {gone.length ? (
        <p className="text-center text-xs text-muted-foreground">Letting go: {gone.map((g) => g.title).join(", ")}</p>
      ) : null}
    </div>
  );
}

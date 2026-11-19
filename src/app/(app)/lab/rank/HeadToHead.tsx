"use client";

import { Link } from "next-view-transitions";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CoverImg } from "@/components/items/CoverImg";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { LabItem } from "../lab-data";

type Kind = "books" | "movies_and_tv";

/**
 * Binary insertion: each new item finds its place among the items with the
 * same star rating, one comparison at a time. A 5-star item never drops below
 * a 4-star item, so the pairs only split ties that stars cannot.
 */
type RankState = { ranked: string[]; queue: string[]; lo: number; hi: number };

function initialState(items: LabItem[]): RankState {
  const queue = [...items]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.id.localeCompare(b.id))
    .map((item) => item.id);
  return { ranked: [], queue, lo: 0, hi: 0 };
}

/** Sets lo/hi for the next queued item: the block of ranked items with its rating. */
function prepare(state: RankState, rating: (id: string) => number): RankState {
  let { ranked, queue } = state;
  // Place items with no peers of the same rating without a question.
  while (queue.length > 0) {
    const r = rating(queue[0]!);
    const lo = ranked.filter((id) => rating(id) > r).length;
    const hi = ranked.filter((id) => rating(id) >= r).length;
    if (lo < hi) return { ranked, queue, lo, hi };
    ranked = [...ranked.slice(0, lo), queue[0]!, ...ranked.slice(lo)];
    queue = queue.slice(1);
  }
  return { ranked, queue, lo: 0, hi: 0 };
}

function storageKey(kind: Kind) {
  return `theque-lab-rank-${kind}`;
}

function load(kind: Kind): { state: RankState; history: RankState[] } | null {
  try {
    const raw = localStorage.getItem(storageKey(kind));
    return raw ? (JSON.parse(raw) as { state: RankState; history: RankState[] }) : null;
  } catch {
    return null;
  }
}

function save(kind: Kind, value: { state: RankState; history: RankState[] }) {
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify(value));
  } catch {
    /* private mode: progress lives only in memory */
  }
}

function Card({ item, onPick, side }: { item: LabItem; onPick: () => void; side: "left" | "right" }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`${item.title} is better`}
      className="group flex w-full flex-col items-center rounded-2xl border border-border bg-card/60 p-4 text-center transition hover:-translate-y-1 hover:border-foreground/40 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="aspect-[2/3] w-full max-w-44 overflow-hidden rounded-lg shadow-xl ring-1 ring-black/10">
        {item.cover ? (
          <CoverImg urls={item.cover} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center p-3 font-serif text-lg" style={{ background: item.color ?? "#57534e" }}>
            {item.title}
          </div>
        )}
      </div>
      <p className="mt-3 line-clamp-2 font-serif text-lg leading-tight text-foreground">{item.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {(item.authors[0] ?? item.directors[0] ?? "") + (item.year ? ` · ${item.year}` : "")}
      </p>
      <span className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground opacity-0 transition group-hover:opacity-100">
        {side === "left" ? "← key" : "key →"}
      </span>
    </button>
  );
}

export function HeadToHead({ items }: { items: LabItem[] }) {
  const [kind, setKind] = useState<Kind>("books");
  const pool = useMemo(() => items.filter((item) => item.category === kind), [items, kind]);
  const byId = useMemo(() => new Map(pool.map((item) => [item.id, item])), [pool]);
  const rating = useCallback((id: string) => byId.get(id)?.rating ?? 0, [byId]);

  const [state, setState] = useState<RankState>(() => prepare(initialState(pool), rating));
  const [history, setHistory] = useState<RankState[]>([]);

  // Load saved progress for this kind; drop ids that left the library.
  useEffect(() => {
    const saved = load(kind);
    const valid = (ids: string[]) => ids.filter((id) => byId.has(id));
    if (saved) {
      const known = new Set([...saved.state.ranked, ...saved.state.queue]);
      const fresh = pool.filter((item) => !known.has(item.id)).map((item) => item.id);
      const next = prepare(
        { ranked: valid(saved.state.ranked), queue: [...valid(saved.state.queue), ...fresh], lo: 0, hi: 0 },
        rating,
      );
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is read after mount so hydration stays clean
      setState(next);
      setHistory([]);
    } else {
      setState(prepare(initialState(pool), rating));
      setHistory([]);
    }
  }, [kind, pool, byId, rating]);

  const current = state.queue[0] ? byId.get(state.queue[0]) : undefined;
  const mid = Math.floor((state.lo + state.hi) / 2);
  const opponent = current ? byId.get(state.ranked[mid]!) : undefined;

  const choose = useCallback(
    (currentWins: boolean) => {
      if (!current) return;
      const lo = currentWins ? state.lo : mid + 1;
      const hi = currentWins ? mid : state.hi;
      let next: RankState;
      if (lo >= hi) {
        const ranked = [...state.ranked.slice(0, lo), current.id, ...state.ranked.slice(lo)];
        next = prepare({ ranked, queue: state.queue.slice(1), lo: 0, hi: 0 }, rating);
      } else {
        next = { ...state, lo, hi };
      }
      const nextHistory = [...history, state].slice(-50);
      setHistory(nextHistory);
      setState(next);
      save(kind, { state: next, history: [] });
    },
    [current, history, kind, mid, rating, state],
  );

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory(history.slice(0, -1));
    setState(previous);
    save(kind, { state: previous, history: [] });
  };

  const reset = () => {
    const fresh = prepare(initialState(pool), rating);
    setState(fresh);
    setHistory([]);
    save(kind, { state: fresh, history: [] });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") choose(true);
      if (event.key === "ArrowRight") choose(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose]);

  const done = pool.length - state.queue.length;
  const ranked = state.ranked.map((id) => byId.get(id)).filter((item): item is LabItem => !!item);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="What to rank" className="flex gap-1 rounded-full bg-muted p-1">
          {(["books", "movies_and_tv"] as const).map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "min-h-8 rounded-full px-3 text-xs",
                kind === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {k === "books" ? "Books" : "Films"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={undo} disabled={history.length === 0}>
            Undo
          </Button>
          <Button variant="ghost" size="sm" onClick={reset}>
            Start over
          </Button>
        </div>
      </div>

      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pool.length ? (done / pool.length) * 100 : 0}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {done} of {pool.length} placed · only 4 and 5 star {kind === "books" ? "books" : "films"} take part
      </p>

      {current && opponent ? (
        <section aria-label="Which was better?" className="mt-6">
          <h2 className="text-center font-heading text-2xl tracking-tight">Which was better?</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-6">
            <Card item={current} side="left" onPick={() => choose(true)} />
            <Card item={opponent} side="right" onPick={() => choose(false)} />
          </div>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => choose(false)}
              className="ks-pointer-coarse-min-hit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Too close to call
            </button>
          </div>
        </section>
      ) : (
        <p className="mt-8 rounded-2xl border border-border bg-card/60 p-5 text-center text-sm">
          Every {kind === "books" ? "book" : "film"} has its place. This is your true ranking.
        </p>
      )}

      <section aria-labelledby="ranking" className="mt-10">
        <h2 id="ranking" className="font-heading text-xl tracking-tight">
          Your ranking so far
        </h2>
        <ol className="mt-4 space-y-1.5">
          {ranked.map((item, index) => (
            <li key={item.id}>
              <Link
                href={`/item/${item.id}`}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted",
                  index < 10 ? "" : "opacity-60",
                )}
              >
                <span className="w-7 shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <div className="h-12 w-8 shrink-0 overflow-hidden rounded-sm bg-muted">
                  {item.cover ? <CoverImg urls={item.cover} className="size-full object-cover" /> : null}
                </div>
                <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                <span className="shrink-0 text-xs text-amber-500">{"★".repeat(item.rating ?? 0)}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

"use client";

import { Link } from "next-view-transitions";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CoverImg } from "@/components/items/CoverImg";
import { TopTenList } from "@/components/rank/TopTenList";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  canUndo,
  currentMatch,
  openSession,
  pick,
  progress,
  type RankSession,
  type RankWrite,
  restart,
  type Step,
  undo,
  type Winner,
} from "@/lib/rank/session";
import {
  contendersFor,
  MIN_CONTENDER_RATING,
  RANK_CATEGORIES,
  type RankCategory,
  topTen,
  type TopTenEntry,
} from "@/lib/rank/top-ten";
import { cn } from "@/lib/utils";

export type RankItem = TopTenEntry & {
  byline: string | null;
  year: number | null;
  category: RankCategory;
  status: string;
  rankOrder: number | null;
  doneAt: string | null;
};

const WORDS: Record<RankCategory, { chip: string; one: string; many: string; shelf: string }> = {
  books: { chip: "Books", one: "book", many: "books", shelf: "books" },
  movies_and_tv: { chip: "Watch", one: "title", many: "films and shows", shelf: "watch" },
};

function chipClass(selected: boolean) {
  return cn(
    "inline-flex min-h-10 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition pointer-coarse:min-h-[var(--tap-target-min)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    selected
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-card text-muted-foreground hover:text-foreground",
  );
}

function MatchCard({ item, side, onPick }: { item: RankItem; side: "left" | "right"; onPick: () => void }) {
  return (
    <Button
      variant="outline"
      onClick={onPick}
      aria-label={`${item.title} was better`}
      aria-keyshortcuts={side === "left" ? "ArrowLeft" : "ArrowRight"}
      className="group/card h-auto w-full min-w-0 flex-col justify-start gap-0 rounded-[var(--ks-radius-card)] bg-card p-3 text-center whitespace-normal hover:-translate-y-0.5 hover:border-foreground/40 sm:p-4 dark:bg-card"
    >
      <span
        className="block aspect-[2/3] w-full max-w-44 overflow-hidden rounded-md shadow-lg ring-1 ring-black/10"
        style={item.color ? { backgroundColor: item.color } : undefined}
      >
        {item.cover ? (
          <CoverImg urls={item.cover} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center p-3 font-heading text-base text-white/90">
            {item.title}
          </span>
        )}
      </span>
      <span className="mt-3 line-clamp-2 w-full font-heading text-base leading-tight text-foreground sm:text-lg">
        {item.title}
      </span>
      <span className="mt-1 line-clamp-1 w-full text-xs font-normal text-muted-foreground">
        {[item.byline, item.year].filter(Boolean).join(" · ")}
      </span>
    </Button>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-[var(--ks-radius-card)] border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export type SaveRankAction = (writes: RankWrite[]) => Promise<{ ok: true } | { ok: false; error: string }>;

export function HeadToHead({ items, saveAction }: { items: RankItem[]; saveAction: SaveRankAction }) {
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [kind, setKind] = useState<RankCategory>(() =>
    items.some((i) => i.category === "books") || !items.some((i) => i.category === "movies_and_tv")
      ? "books"
      : "movies_and_tv",
  );
  const [sessions, setSessions] = useState<Record<RankCategory, RankSession>>(() => ({
    books: openSession(contendersFor(items, "books")),
    movies_and_tv: openSession(contendersFor(items, "movies_and_tv")),
  }));
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = sessions[kind];
  const words = WORDS[kind];
  const match = currentMatch(session);
  const challenger = match ? byId.get(match.challenger) : undefined;
  const opponent = match ? byId.get(match.opponent) : undefined;
  const { placed, total } = progress(session);
  const ratedCount = useMemo(() => items.filter((i) => i.category === kind).length, [items, kind]);

  const save = useCallback((writes: RankWrite[]) => {
    if (writes.length === 0) return;
    saveAction(writes)
      .then((result) => {
        if (!result.ok) setError(result.error);
      })
      .catch(() => setError("That ranking did not save. Check your connection and reload."));
  }, [saveAction]);

  const apply = useCallback(
    (step: Step) => {
      setSessions((all) => ({ ...all, [kind]: step.session }));
      save(step.writes);
    },
    [kind, save],
  );

  const choose = useCallback((winner: Winner) => apply(pick(session, winner)), [apply, session]);

  useEffect(() => {
    if (!match || confirmingRestart) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        choose("challenger");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        choose("opponent");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, confirmingRestart, match]);

  // The top 10 uses the keys of this session, so it moves with each pick.
  const top = useMemo(() => {
    const live = items.map((i) =>
      i.id in sessions[i.category].saved ? { ...i, rankOrder: sessions[i.category].saved[i.id] ?? null } : i,
    );
    return topTen(live, kind);
  }, [items, kind, sessions]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="What to rank" className="flex gap-2">
          {RANK_CATEGORIES.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => {
                setKind(k);
                setConfirmingRestart(false);
              }}
              className={chipClass(kind === k)}
            >
              {WORDS[k].chip}
            </button>
          ))}
        </div>
        {total > 1 ? (
          <div className="flex items-center gap-1">
            {confirmingRestart ? (
              <>
                <span className="mr-1 text-sm text-muted-foreground">Clear all places?</span>
                <Button
                  variant="destructive"
                  onClick={() => {
                    apply(restart(session));
                    setConfirmingRestart(false);
                  }}
                >
                  Clear
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingRestart(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => apply(undo(session))} disabled={!canUndo(session)}>
                  Undo
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingRestart(true)} disabled={placed === 0}>
                  Start over
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {total > 0 ? (
        <>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${(placed / total) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {placed} of {total}
            </span>{" "}
            placed. Only {words.many} with {MIN_CONTENDER_RATING} or 5 stars play.
          </p>
        </>
      ) : null}

      {challenger && opponent ? (
        <section aria-labelledby="match-heading" className="mt-6">
          <h2 id="match-heading" className="text-center font-heading text-2xl tracking-tight">
            Which was better?
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-6">
            <MatchCard item={challenger} side="left" onPick={() => choose("challenger")} />
            <MatchCard item={opponent} side="right" onPick={() => choose("opponent")} />
          </div>
          <div className="mt-3 flex flex-col items-center gap-1">
            <Button variant="ghost" onClick={() => choose("opponent")} className="text-muted-foreground">
              Too close to call
            </Button>
            <p className="hidden text-xs text-muted-foreground lg-fine:block">
              Press <kbd className="font-mono">←</kbd> or <kbd className="font-mono">→</kbd> to pick a side.
            </p>
          </div>
        </section>
      ) : total > 1 ? (
        <Notice>
          <p className="font-heading text-lg text-foreground">Every {words.one} has its place.</p>
          <p className="mt-1">Finish and rate another one, and it gets its own match.</p>
        </Notice>
      ) : (
        <Notice>
          <p className="font-heading text-lg text-foreground">
            {total === 1 ? `One ${words.one} so far` : `No ${words.many} to rank yet`}
          </p>
          <p className="mx-auto mt-1 max-w-sm">
            Matches start when two {words.many} have {MIN_CONTENDER_RATING} or 5 stars. Rate what you finish.
          </p>
          <Link href={`/library?shelf=${words.shelf}`} className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
            Open {words.chip}
          </Link>
        </Notice>
      )}

      {ratedCount > 0 ? (
        <section aria-labelledby="top-heading" className="mt-10">
          <h2 id="top-heading" className="font-heading text-xl tracking-tight">
            Your top 10
          </h2>
          <div className="mt-3">
            <TopTenList entries={top} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

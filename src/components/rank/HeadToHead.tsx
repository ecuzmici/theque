"use client";

import { Link } from "next-view-transitions";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CoverImg } from "@/components/items/CoverImg";
import { TopTenList } from "@/components/rank/TopTenList";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  canUndo,
  confirmSaved,
  currentMatch,
  openSession,
  pendingWrites,
  pick,
  placements,
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

const KBD = "mx-0.5 inline-flex min-w-6 items-center justify-center rounded border border-border bg-muted px-1 py-0.5 font-sans text-sm leading-none text-foreground";

function chipClass(selected: boolean) {
  return cn(
    "h-10 rounded-full border px-3.5 text-sm font-medium",
    selected
      ? "border-foreground bg-foreground text-background hover:bg-foreground hover:text-background dark:hover:bg-foreground"
      : "border-border bg-card text-muted-foreground hover:text-foreground",
  );
}

/** Arrow keys pick a side, except when focus is on another control. */
function arrowsBelongToMatch(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;
  if (target.closest("[data-match-card]")) return true;
  return !target.closest(
    "[role='radiogroup'], button, a, input, textarea, select, [contenteditable='true'], [tabindex]:not([tabindex='-1'])",
  );
}

function MatchCard({
  item,
  side,
  onPick,
  disabled,
}: {
  item: RankItem;
  side: "left" | "right";
  onPick: () => void;
  disabled: boolean;
}) {
  return (
    <Button
      variant="outline"
      data-match-card
      onClick={onPick}
      disabled={disabled}
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
  // A save in flight or a failed save blocks new picks, so page and database cannot drift apart.
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ kind: RankCategory; message: string } | null>(null);
  const busy = saving || error !== null;
  // Controls look disabled only after a failure. During a short save, `apply` drops the pick.
  const blocked = error !== null;

  const session = sessions[kind];
  const words = WORDS[kind];
  const match = currentMatch(session);
  const challenger = match ? byId.get(match.challenger) : undefined;
  const opponent = match ? byId.get(match.opponent) : undefined;
  const { placed, total } = progress(session);
  const ratedCount = useMemo(() => items.filter((i) => i.category === kind).length, [items, kind]);

  /** Sends the pending writes of one category. `saved` moves only when the save succeeds. */
  const flush = useCallback(
    async (k: RankCategory, next: RankSession) => {
      const writes = pendingWrites(next);
      if (writes.length === 0) return;
      setSaving(true);
      let result: Awaited<ReturnType<SaveRankAction>>;
      try {
        result = await saveAction(writes);
      } catch {
        result = { ok: false, error: "That ranking did not save. Check your connection." };
      }
      setSaving(false);
      if (result.ok) {
        setSessions((all) => ({ ...all, [k]: confirmSaved(all[k], writes) }));
        setError(null);
      } else {
        setError({ kind: k, message: result.error });
      }
    },
    [saveAction],
  );

  const apply = useCallback(
    (step: Step) => {
      if (busy) return;
      setSessions((all) => ({ ...all, [kind]: step.session }));
      void flush(kind, step.session);
    },
    [busy, flush, kind],
  );

  const retry = () => {
    if (!error || saving) return;
    void flush(error.kind, sessions[error.kind]);
  };

  const choose = useCallback((winner: Winner) => apply(pick(session, winner)), [apply, session]);

  useEffect(() => {
    if (!match || confirmingRestart || busy) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!arrowsBelongToMatch(event.target)) return;
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
  }, [busy, choose, confirmingRestart, match]);

  // The top 10 uses the keys of this session, so it moves with each pick.
  const top = useMemo(() => {
    const keys = placements(sessions[kind]);
    const live = items.map((i) => (i.id in keys ? { ...i, rankOrder: keys[i.id] ?? null } : i));
    return topTen(live, kind);
  }, [items, kind, sessions]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="What to rank" className="flex gap-2">
          {RANK_CATEGORIES.map((k) => (
            <Button
              key={k}
              variant="ghost"
              role="radio"
              aria-checked={kind === k}
              onClick={() => {
                setKind(k);
                setConfirmingRestart(false);
              }}
              className={chipClass(kind === k)}
            >
              {WORDS[k].chip}
            </Button>
          ))}
        </div>
        {total > 1 ? (
          <div className="flex items-center gap-1">
            {confirmingRestart ? (
              <>
                <span className="mr-1 text-sm text-muted-foreground">Clear all places?</span>
                <Button
                  variant="destructive"
                  disabled={blocked}
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
                <Button variant="outline" onClick={() => apply(undo(session))} disabled={blocked || !canUndo(session)}>
                  Undo
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingRestart(true)} disabled={blocked || placed === 0}>
                  Start over
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          <span className="min-w-0">
            {error.message} {error.kind !== kind ? `(${WORDS[error.kind].chip})` : null}
          </span>
          <Button variant="outline" onClick={retry} disabled={saving}>
            {saving ? "Saving" : "Retry"}
          </Button>
        </div>
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
            <MatchCard item={challenger} side="left" disabled={blocked} onPick={() => choose("challenger")} />
            <MatchCard item={opponent} side="right" disabled={blocked} onPick={() => choose("opponent")} />
          </div>
          <div className="mt-3 flex flex-col items-center gap-1">
            <Button
              variant="ghost"
              disabled={blocked}
              onClick={() => choose("opponent")}
              className="text-muted-foreground"
            >
              Too close to call
            </Button>
            <p className="hidden text-xs text-muted-foreground lg-fine:block">
              Press <kbd className={KBD}>←</kbd> or <kbd className={KBD}>→</kbd> to pick a side.
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

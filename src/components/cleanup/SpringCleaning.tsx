"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { keepItem, restoreKeptAt } from "@/app/(app)/cleanup/actions";
import { buttonVariants, Button } from "@/components/ui/button";
import {
  AGE_CHOICES,
  createPass,
  decide,
  passQueue,
  passSummary,
  revertDecision,
  undoLast,
  type PassChoice,
  type PassItem,
} from "@/lib/cleanup/pass";
import { patchItemRequest, reportSaveError } from "@/lib/save-error";
import { cn } from "@/lib/utils";

import { CardFace, SwipeCard, type CardItem } from "./CleanupCard";
import { UndoToast, type UndoNotice } from "./UndoToast";
import { useReducedMotion } from "./useReducedMotion";

export type CleanupItem = PassItem & CardItem;

/** Length of the fling before the next card shows. */
const FLING_MS = 180;

const CHIP_BASE =
  "inline-flex min-h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium transition pointer-coarse:min-h-[var(--tap-target-min)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHIP_ACTIVE = "border-foreground bg-foreground/[0.07] text-foreground";
const CHIP_IDLE = "border-border bg-card text-muted-foreground hover:text-foreground";

/** Saves a decision on the server. Keep writes `kept_at`; Let go dismisses the item. */
async function saveDecision(id: string, choice: PassChoice): Promise<boolean> {
  if (choice === "keep") return (await keepItem(id)).ok;
  return patchItemRequest(id, { status: "dismissed" });
}

/** Reverses a saved decision. */
async function saveUndo(id: string, choice: PassChoice, keptAt: string | null): Promise<boolean> {
  if (choice === "keep") return (await restoreKeptAt(id, keptAt)).ok;
  return patchItemRequest(id, { status: "want" });
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * The spring-cleaning pass. One forgotten item at a time: swipe right, press
 * →, or tap Keep to keep it; swipe left, press ←, or tap Let go to dismiss it.
 * Each decision saves at once and shows an undo toast.
 */
export function SpringCleaning({ items, now }: { items: CleanupItem[]; now: number }) {
  const [pass, setPass] = useState(() => createPass(items));
  const [age, setAge] = useState<number>(AGE_CHOICES[0].days);
  const [leaving, setLeaving] = useState<PassChoice | null>(null);
  const [notice, setNotice] = useState<UndoNotice | null>(null);
  const reducedMotion = useReducedMotion();
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const noticeKey = useRef(0);

  const queue = passQueue(pass, age, now);
  const current = queue[0] ?? null;
  const next = queue[1] ?? null;
  const summary = passSummary(pass);
  const decided = summary.kept + summary.letGo;
  const counts = AGE_CHOICES.map((choice) => passQueue(pass, choice.days, now).length);
  const otherAge = AGE_CHOICES.find((choice, i) => choice.days !== age && counts[i]! > 0) ?? null;

  /** Runs the server writes one after the other, so an undo never overtakes its decision. */
  const enqueue = useCallback((write: () => Promise<void>) => {
    writes.current = writes.current.then(write, write);
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  function apply(item: CleanupItem, choice: PassChoice) {
    setPass((state) => decide(state, item.id, choice, new Date().toISOString()));
    setLeaving(null);
    noticeKey.current += 1;
    setNotice({ key: noticeKey.current, text: choice === "keep" ? `Kept ${item.title}` : `Let go of ${item.title}` });
    enqueue(async () => {
      if (await saveDecision(item.id, choice)) return;
      setPass((state) => revertDecision(state, item.id));
      setNotice(null);
      reportSaveError();
    });
  }

  function commit(choice: PassChoice) {
    if (!current || leaving) return;
    const item = current;
    setLeaving(choice);
    window.setTimeout(() => apply(item, choice), reducedMotion ? 100 : FLING_MS);
  }

  function undo() {
    if (leaving) return;
    const { state, undone } = undoLast(pass);
    if (!undone) return;
    setPass(state);
    setNotice(null);
    enqueue(async () => {
      if (await saveUndo(undone.id, undone.choice, undone.before.kept_at)) return;
      setPass((s) => decide(s, undone.id, undone.choice, new Date().toISOString()));
      reportSaveError();
    });
  }

  // The key handler reads the latest commit and undo through a ref, so it subscribes one time.
  const handlers = useRef({ commit, undo });
  useEffect(() => {
    handlers.current = { commit, undo };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handlers.current.undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        handlers.current.commit("keep");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlers.current.commit("let_go");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ageLabel = AGE_CHOICES.find((choice) => choice.days === age)!.label;

  return (
    // The pass fills the screen under the header: 3.5rem header, 1.75rem top
    // padding, and 5rem at the bottom for the undo toast.
    <div className="mx-auto flex h-[calc(100dvh-10.25rem-env(safe-area-inset-bottom))] min-h-[28rem] w-full max-w-md flex-col gap-3 lg:max-h-[44rem]">
      <header className="shrink-0">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-heading text-3xl tracking-tight text-foreground">Spring cleaning</h1>
          <p className="shrink-0 text-sm tabular-nums text-muted-foreground" aria-live="polite">
            {queue.length} left
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Saved more than"
          className="-mx-4 mt-3 flex items-center gap-1.5 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <span className="mr-0.5 shrink-0 text-[13px] text-muted-foreground">Saved more than</span>
          {AGE_CHOICES.map((choice) => (
            <button
              key={choice.days}
              type="button"
              role="radio"
              aria-checked={age === choice.days}
              disabled={!!leaving}
              onClick={() => setAge(choice.days)}
              className={cn(CHIP_BASE, age === choice.days ? CHIP_ACTIVE : CHIP_IDLE)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </header>

      {current ? (
        <>
          {/* The clip stops a dragged card from adding a horizontal scroll. */}
          <div className="-mx-4 min-h-0 flex-1 overflow-x-clip px-4 lg:-mx-24 lg:px-24">
            <div className="relative h-full">
              {next ? (
                <div
                  aria-hidden
                  className="absolute inset-0 translate-y-2 scale-[0.96] overflow-hidden rounded-2xl border border-border bg-card opacity-70 shadow-sm"
                >
                  <CardFace item={next} now={now} />
                </div>
              ) : null}
              <SwipeCard
                key={current.id}
                item={current}
                now={now}
                leaving={leaving}
                reducedMotion={reducedMotion}
                onSwipe={commit}
              />
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 gap-2 text-base text-destructive hover:text-destructive"
              onClick={() => commit("let_go")}
              aria-keyshortcuts="ArrowLeft"
            >
              <ArrowLeft aria-hidden /> Let go
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 gap-2 text-base text-emerald-700 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400"
              onClick={() => commit("keep")}
              aria-keyshortcuts="ArrowRight"
            >
              Keep <ArrowRight aria-hidden />
            </Button>
          </div>
          <p className="-mt-1 hidden shrink-0 text-center text-xs text-muted-foreground lg-fine:block">
            Keys: ← to let go, → to keep.
          </p>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 text-center">
          {decided > 0 ? (
            <>
              <h2 className="font-heading text-2xl text-card-foreground">Pass done</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                You kept {plural(summary.kept, "item")} and let go of {summary.letGo}.
              </p>
              {summary.kept > 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">Kept items come back here in 6 months.</p>
              ) : null}
            </>
          ) : (
            <>
              <h2 className="font-heading text-2xl text-card-foreground">
                {otherAge ? `Nothing saved more than ${ageLabel} ago` : "Nothing forgotten"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {otherAge
                  ? "Pick a shorter time to see more."
                  : "Every item on Want is newer than 6 months, or you kept it lately."}
              </p>
            </>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {otherAge ? (
              <Button type="button" variant="outline" size="lg" onClick={() => setAge(otherAge.days)}>
                Switch to {otherAge.label}
              </Button>
            ) : null}
            {decided > 0 ? (
              <Button type="button" variant="outline" size="lg" onClick={undo}>
                Undo last
              </Button>
            ) : null}
            <Link href="/library" className={buttonVariants({ size: "lg" })}>
              Back to library
            </Link>
          </div>
        </div>
      )}

      <UndoToast notice={notice} onUndo={undo} onDismiss={dismissNotice} />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import {
  MIN_FALLBACK_AGE_DAYS,
  pickResurfacedItem,
  resurfaceLabel,
  startOfCalendarMonthISO,
  type ResurfaceCandidate,
  type ResurfacePick,
} from "@/lib/insights/on-this-day";
import { getDisplayImageUrl } from "@/lib/item-display";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type CandidateRow = ResurfaceCandidate & {
  image_url: string | null;
  image_storage_path: string | null;
  dominant_color: string | null;
};

/**
 * Generous cap on the candidate read. Every tier (year / six-months / oldest)
 * is an *older* save, so we fetch oldest-first and only items already past the
 * fallback floor — far beyond any real PoC library, so the pick is exact.
 */
const FETCH_LIMIT = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Dismissing a pick stores its id; a *different* future pick still shows. */
const DISMISS_KEY = "theque_on_this_day_dismissed";

function readDismissedId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function persistDismissedId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, id);
  } catch {
    // Storage unavailable (private mode / quota) — dismissal just isn't sticky.
  }
}

/**
 * "On this day" — a quiet, dismissible nudge that resurfaces one meaningful past
 * save (a save ~1 year old, else ~6 months, else the oldest unfinished one) plus
 * a calm "N saved this month" cadence line. Same best-effort, fail-silent spirit
 * as {@link LibrarySpineBand}; gated to the `all` shelf by its caller.
 */
export function OnThisDay() {
  const [pick, setPick] = useState<ResurfacePick<CandidateRow> | null>(null);
  const [savedThisMonth, setSavedThisMonth] = useState<number>(0);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      try {
        const cutoff = new Date(Date.now() - MIN_FALLBACK_AGE_DAYS * DAY_MS).toISOString();
        const { data } = await supabase
          .from("items")
          .select("id, title, created_at, status, image_url, image_storage_path, dominant_color")
          .neq("status", "done")
          .neq("status", "dismissed")
          .lte("created_at", cutoff)
          .order("created_at", { ascending: true })
          .limit(FETCH_LIMIT);

        const chosen = pickResurfacedItem((data ?? []) as CandidateRow[]);

        const { count } = await supabase
          .from("items")
          .select("id", { count: "exact", head: true })
          .neq("status", "dismissed")
          .gte("created_at", startOfCalendarMonthISO());

        if (cancelled) return;
        setSavedThisMonth(count ?? 0);
        if (chosen && readDismissedId() === chosen.item.id) {
          setPick(null);
        } else {
          setPick(chosen);
        }
      } catch {
        // Best-effort; on any failure we simply render nothing.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Fade in once there is something to show (instant under reduced motion).
  useEffect(() => {
    if (!pick) return;
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [pick]);

  if (dismissed || !pick) return null;

  const { item, tier } = pick;
  const imgSrc = getDisplayImageUrl(item.image_storage_path, item.image_url);

  return (
    <div
      className={cn(
        "mb-5 transition-opacity duration-500 ease-out motion-reduce:transition-none",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="relative flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 dark:border-amber-400/25 dark:bg-amber-400/[0.06]">
        <Link
          href={`/item/${item.id}`}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
            style={item.dominant_color ? { backgroundColor: item.dominant_color } : undefined}
          >
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
              {resurfaceLabel(tier)}
            </span>
            <span className="block truncate font-medium text-foreground group-hover:underline">
              {item.title ?? "Something you saved"}
            </span>
            <span className="block text-sm text-muted-foreground">Still interested?</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => {
            persistDismissedId(item.id);
            setDismissed(true);
          }}
          aria-label="Dismiss"
          className="ks-pointer-coarse-min-hit absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {savedThisMonth > 0 ? (
        <p className="mt-1.5 px-1 text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{savedThisMonth}</span> saved
          this month
        </p>
      ) : null}
    </div>
  );
}

"use client";

/**
 * "Made for you" recommendation banner, framed as a single-tier unlockable
 * achievement. Shown on the default "All" shelf (the library's landing) so the
 * AI-recommendation feature is discoverable without drilling into a category.
 *
 * Progress = save RECOMMEND_MIN_ITEMS titled items in a category → that
 * category's recommendations unlock. Before unlock, a progress-ring CTA shows how
 * close the user is; after unlock, the banner flips to the active "Get my picks"
 * state with a quiet reminder that rating finished items sharpens results.
 *
 * The unlock is governed live by the per-category item count, but cosmetically
 * sticky via localStorage (see `unlock-storage.ts`) so finishing the very items
 * that unlocked a category doesn't re-lock the banner. Counts come from dedicated
 * COUNT queries (not the paginated shelf cache) so the unlock is detected
 * accurately regardless of library size.
 */

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, Clapperboard, Sparkles, Star } from "lucide-react";

import { useRecommendationContext } from "@/components/recommend/RecommendationProvider";
import {
  UnlockCelebration,
  type CelebrationCategory,
} from "@/components/recommend/UnlockCelebration";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ItemCategory } from "@/lib/database.types";
import { getDisplayImageUrl } from "@/lib/item-display";
import { RECOMMEND_MIN_ITEMS } from "@/lib/recommend/recommend-config";
import type { RecommendShelfId } from "@/lib/recommend/recommend-types";
import {
  effectiveUnlocked,
  persistCelebrated,
  persistUnlocked,
  readCelebrated,
  readUnlocked,
  shouldCelebrateUnlock,
} from "@/lib/recommend/unlock-storage";
import { createClient } from "@/lib/supabase/client";
import type { LibraryItemRow } from "@/lib/types/library-item";
import { cn } from "@/lib/utils";

const SAVE_TARGET = RECOMMEND_MIN_ITEMS;

type CategoryMeta = {
  shelfId: RecommendShelfId;
  /** DB category value used by the count query. */
  category: ItemCategory;
  label: string;
  noun: string;
  Icon: typeof BookOpen;
};

const CATEGORIES: CategoryMeta[] = [
  { shelfId: "books", category: "books", label: "Books", noun: "books", Icon: BookOpen },
  {
    shelfId: "watch",
    category: "movies_and_tv",
    label: "Watch",
    noun: "titles",
    Icon: Clapperboard,
  },
];

type CategoryProgress = CategoryMeta & { saved: number; unlocked: boolean };

type Props = {
  booksEnabled: boolean;
  watchEnabled: boolean;
  /** Already-loaded "All" items — used only for the decorative cover thumbnails. */
  items: LibraryItemRow[];
};

export function RecommendUnlockBanner({ booksEnabled, watchEnabled, items }: Props) {
  const { start } = useRecommendationContext();

  const enabled = useMemo(
    () =>
      CATEGORIES.filter((c) => (c.shelfId === "books" ? booksEnabled : watchEnabled)),
    [booksEnabled, watchEnabled],
  );

  // `null` while the counts are still loading, so the banner doesn't flash a
  // locked state for an already-unlocked library.
  const [progress, setProgress] = useState<CategoryProgress[] | null>(null);
  // Set once, when a category crosses the unlock threshold for the first time on
  // this device — drives the one-time celebration toast.
  const [celebrating, setCelebrating] = useState<CelebrationCategory | null>(null);

  useEffect(() => {
    if (enabled.length === 0) return;
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const results = await Promise.all(
        enabled.map(async (c) => {
          // Read the sticky flag *before* this load persists the unlock, so a
          // library already unlocked on a prior visit is never celebrated again.
          const wasStored = readUnlocked(c.shelfId);
          const { count } = await supabase
            .from("items")
            .select("id", { count: "exact", head: true })
            .eq("category", c.category)
            .not("status", "in", "(done,dismissed)")
            .not("title", "is", null)
            .neq("title", "");
          const saved = count ?? 0;
          // Persist the moment a category crosses the gate, then read it back so
          // the displayed state reflects the sticky flag consistently.
          if (saved >= SAVE_TARGET) persistUnlocked(c.shelfId);
          const unlocked = effectiveUnlocked(saved, readUnlocked(c.shelfId), SAVE_TARGET);
          const fresh = shouldCelebrateUnlock({
            nowUnlocked: unlocked,
            wasStored,
            celebrated: readCelebrated(c.shelfId),
          });
          return { row: { ...c, saved, unlocked }, fresh };
        }),
      );
      if (cancelled) return;
      setProgress(results.map((r) => r.row));
      // Celebrate at most one category per load (the nearest-to-goal fresh one);
      // any other fresh category will celebrate on a later visit.
      const fresh = results.filter((r) => r.fresh).map((r) => r.row);
      const toCelebrate =
        fresh.length > 0 ? [...fresh].sort((a, b) => b.saved - a.saved)[0] : null;
      if (toCelebrate) {
        // Mark celebrated at show-time so dismiss/unmount never re-fires it.
        persistCelebrated(toCelebrate.shelfId);
        setCelebrating({
          shelfId: toCelebrate.shelfId,
          label: toCelebrate.label,
          Icon: toCelebrate.Icon,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const thumbs = useMemo(
    () =>
      items
        .map((i) => getDisplayImageUrl(i.image_storage_path, i.image_url))
        .filter((u): u is string => Boolean(u))
        .slice(0, 3),
    [items],
  );

  if (enabled.length === 0) return null;
  if (progress == null || progress.length === 0) return null;

  const featured = featuredOf(progress);

  const celebration = celebrating ? (
    <UnlockCelebration
      category={celebrating}
      onStart={start}
      onDismiss={() => setCelebrating(null)}
    />
  ) : null;

  if (featured.unlocked) {
    return (
      <>
        <div className={SHELL}>
          <ActiveBanner rows={progress.map(toRow)} start={start} thumbs={thumbs} />
        </div>
        {celebration}
      </>
    );
  }

  const a = achieve(featured);
  return (
    <>
      <div className={SHELL}>
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button type="button" aria-label={a.line} className={RING_CLASS} />}
          >
            <RingTrack value={a.value} max={a.max} />
            <Sparkles className="relative size-6 text-amber-600 dark:text-amber-400" />
          </DropdownMenuTrigger>
          <RecommendMenuContent rows={[toRow(featured)]} start={start} align="start" />
        </DropdownMenu>

        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-foreground sm:text-lg">
            {a.word ?? a.line}
          </p>
          <div className="mt-0.5">
            <MetaLine p={featured} value={a.value} max={a.max} />
          </div>
        </div>

        <StackedCovers thumbs={thumbs} />
      </div>
      </div>
      {celebration}
    </>
  );
}

/** Once any category is unlocked, feature an unlocked one; else the nearest. */
function featuredOf(cats: CategoryProgress[]): CategoryProgress {
  const unlocked = cats.filter((c) => c.unlocked);
  const pool = unlocked.length > 0 ? unlocked : cats;
  return [...pool].sort((a, b) => b.saved - a.saved)[0];
}

/** Next concrete action in 2–4 words. `word` is a punchy near-goal beat. */
function achieve(p: CategoryProgress): {
  value: number;
  max: number;
  word: string | null;
  line: string;
} {
  const remaining = SAVE_TARGET - p.saved;
  return {
    value: Math.min(p.saved, SAVE_TARGET),
    max: SAVE_TARGET,
    word: remaining === 1 ? "Almost there!" : null,
    line: p.saved === 0 ? `Save ${SAVE_TARGET} to unlock` : `${remaining} more to unlock`,
  };
}

const SHELL =
  "mb-5 overflow-hidden rounded-2xl border border-amber-300/40 bg-amber-50 px-4 py-4 dark:border-amber-400/15 dark:bg-amber-500/10 sm:px-5";

const RING_CLASS =
  "relative grid size-16 shrink-0 place-items-center rounded-full bg-amber-50 ring-1 ring-amber-300/50 transition active:scale-95 dark:bg-amber-500/10 dark:ring-amber-400/20";

/** Full-width on mobile, auto on desktop; ≥44px tap target. */
const CTA_CLASS = "min-h-11 w-full shrink-0 gap-1.5 sm:w-auto";

type CategoryRow = {
  shelfId: RecommendShelfId;
  label: string;
  noun: string;
  Icon: typeof BookOpen;
  ready: boolean;
};

function toRow(p: CategoryProgress): CategoryRow {
  return { shelfId: p.shelfId, label: p.label, noun: p.noun, Icon: p.Icon, ready: p.unlocked };
}

/* ---- active (unlocked) banner -------------------------------------------- */

function ActiveBanner({
  rows,
  start,
  thumbs,
}: {
  rows: CategoryRow[];
  start: (s: RecommendShelfId) => void;
  thumbs: string[];
}) {
  const readyRows = rows.filter((r) => r.ready);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <StackedCovers thumbs={thumbs} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-base font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Made for you
          </p>
          <div className="mt-0.5">
            <VerdictTip />
          </div>
        </div>
      </div>
      <RecommendEntry
        rows={readyRows}
        start={start}
        align="end"
        chrome={(onClick) => (
          <Button type="button" onClick={onClick} className={CTA_CLASS}>
            <Sparkles className="h-4 w-4" />
            Get my picks
            {readyRows.length > 1 ? <ChevronDown className="h-4 w-4 opacity-80" /> : null}
          </Button>
        )}
      />
    </div>
  );
}

/** Quiet, non-blocking nudge shown only after unlock. Not a tier, not a bar. */
function VerdictTip() {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Star className="h-3.5 w-3.5" />
      Rate finished items to sharpen picks
    </span>
  );
}

/* ---- collapsing category picker (shared by locked + unlocked CTAs) -------- */

/** 0 rows → null; 1 → direct activate; ≥2 → open the picker. */
function RecommendEntry({
  rows,
  start,
  chrome,
  align,
}: {
  rows: CategoryRow[];
  start: (s: RecommendShelfId) => void;
  chrome: (directOnClick: (() => void) | undefined) => React.ReactElement;
  align?: "start" | "center" | "end";
}) {
  if (rows.length === 0) return null;
  if (rows.length === 1) {
    const only = rows[0];
    return chrome(only.ready ? () => start(only.shelfId) : () => {});
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={chrome(undefined)} />
      <RecommendMenuContent rows={rows} start={start} align={align} />
    </DropdownMenu>
  );
}

function RecommendMenuContent({
  rows,
  start,
  align = "end",
}: {
  rows: CategoryRow[];
  start: (s: RecommendShelfId) => void;
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenuContent align={align} className="w-64">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Recommend from…</DropdownMenuLabel>
        {rows.map((row) => (
          <DropdownMenuItem
            key={row.shelfId}
            disabled={!row.ready}
            onClick={row.ready ? () => start(row.shelfId) : undefined}
            className="flex-col items-start gap-0.5 py-2"
          >
            <span className="flex items-center gap-2 font-medium">
              <row.Icon className="h-4 w-4" />
              {row.label}
            </span>
            {!row.ready ? (
              <span className="pl-6 text-xs text-muted-foreground">
                Add {SAVE_TARGET}+ {row.noun} to unlock
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}

/* ---- visual atoms --------------------------------------------------------- */

/** Circular progress ring drawn behind the ring button's icon. */
function RingTrack({ value, max }: { value: number; max: number }) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const r = 28;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="absolute inset-0 size-full -rotate-90" aria-hidden>
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="5"
        className="stroke-amber-200 dark:stroke-amber-400/20"
      />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        className="stroke-amber-500 transition-[stroke-dasharray] duration-700 dark:stroke-amber-400"
        strokeDasharray={`${(c * pct).toFixed(2)} ${c.toFixed(2)}`}
      />
    </svg>
  );
}

/**
 * Small neat stacked cover-art cluster. Hidden on the narrowest phones (<400px)
 * so the row never overflows; shows from there up.
 */
function StackedCovers({ thumbs }: { thumbs: string[] }) {
  if (thumbs.length === 0) return null;
  return (
    <div className="hidden shrink-0 items-center min-[400px]:flex">
      {thumbs.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- small decorative thumbnail; avoids next/image remote-domain config
        <img
          key={i}
          src={src}
          alt=""
          className={cn(
            "h-14 w-10 rounded-md object-cover shadow-sm ring-2 ring-background",
            i > 0 && "-ml-4",
          )}
        />
      ))}
    </div>
  );
}

/** Category chip (icon + label + count) — the only fine print kept. */
function MetaLine({
  p,
  value,
  max,
}: {
  p: CategoryProgress;
  value: number;
  max: number;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <p.Icon className="h-3.5 w-3.5" />
      {p.label}
      <span className="tabular-nums">
        · {Math.min(value, max)}/{max}
      </span>
    </span>
  );
}

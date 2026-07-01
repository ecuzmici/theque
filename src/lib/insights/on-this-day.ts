/**
 * "On this day" resurfacing — pick a meaningful past save to gently re-surface
 * on the library, in the same calm spirit as the "N forgotten" nudge.
 *
 * Pure + deterministic given `now`, so it is unit-testable. The caller supplies
 * a candidate pool of items; this module owns the tier rules (year → six months
 * → oldest) and the young/empty-library nothing-case. Done/dismissed items are
 * excluded here too (defence in depth), so the helper is correct regardless of
 * how the caller filtered.
 */

export type ResurfaceTier = "year" | "six-months" | "oldest";

export type ResurfaceCandidate = {
  id: string;
  title: string | null;
  created_at: string | null;
  status: string;
};

export type ResurfacePick<T> = {
  item: T;
  tier: ResurfaceTier;
  ageDays: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Anniversary targets and the ± window (days) that still counts as "on this day". */
const YEAR_TARGET_DAYS = 365;
const SIX_MONTHS_TARGET_DAYS = 183;
const ANNIVERSARY_WINDOW_DAYS = 14;

/** The oldest-save fallback only fires once the library itself has some age. */
export const MIN_FALLBACK_AGE_DAYS = 30;

function ageInDays(createdAt: string, now: number): number {
  return (now - new Date(createdAt).getTime()) / DAY_MS;
}

function isResurfaceable(status: string): boolean {
  return status !== "done" && status !== "dismissed";
}

/**
 * Choose a single item to resurface, or `null` when nothing is worth showing
 * (empty pool, or a library too young for even the oldest-save fallback).
 *
 * Tiers, in priority order:
 *   1. `year`        — closest save to ~1 year old (within ±14 days)
 *   2. `six-months`  — closest save to ~6 months old (within ±14 days)
 *   3. `oldest`      — the oldest still-unfinished save, only if ≥ 30 days old
 */
export function pickResurfacedItem<T extends ResurfaceCandidate>(
  items: readonly T[],
  now: number = Date.now(),
): ResurfacePick<T> | null {
  const candidates = items
    .filter((it) => Boolean(it.created_at) && Boolean(it.title) && isResurfaceable(it.status))
    .map((it) => ({ item: it, ageDays: ageInDays(it.created_at as string, now) }))
    // Ignore future-dated rows (clock skew / bad data).
    .filter((c) => c.ageDays >= 0);

  if (candidates.length === 0) return null;

  const byAnniversary = (target: number, tier: ResurfaceTier): ResurfacePick<T> | null => {
    const inWindow = candidates.filter(
      (c) => Math.abs(c.ageDays - target) <= ANNIVERSARY_WINDOW_DAYS,
    );
    if (inWindow.length === 0) return null;
    // Closest to the exact anniversary; ties broken toward the more recent save.
    inWindow.sort((a, b) => {
      const da = Math.abs(a.ageDays - target);
      const db = Math.abs(b.ageDays - target);
      if (da !== db) return da - db;
      return (b.item.created_at ?? "").localeCompare(a.item.created_at ?? "");
    });
    const top = inWindow[0];
    return { item: top.item, tier, ageDays: top.ageDays };
  };

  const year = byAnniversary(YEAR_TARGET_DAYS, "year");
  if (year) return year;

  const sixMonths = byAnniversary(SIX_MONTHS_TARGET_DAYS, "six-months");
  if (sixMonths) return sixMonths;

  // Oldest still-unfinished save — but stay quiet until the library has aged,
  // so a brand-new library never gets an awkward "a while ago" on a fresh save.
  const oldest = candidates.reduce((a, b) => (a.ageDays >= b.ageDays ? a : b));
  if (oldest.ageDays < MIN_FALLBACK_AGE_DAYS) return null;
  return { item: oldest.item, tier: "oldest", ageDays: oldest.ageDays };
}

/** Short, calm caption for each tier. */
export function resurfaceLabel(tier: ResurfaceTier): string {
  switch (tier) {
    case "year":
      return "A year ago";
    case "six-months":
      return "Six months ago";
    case "oldest":
      return "A while ago";
  }
}

/**
 * Start of the current calendar month, in UTC, as an ISO string — for the
 * "N saved this month" cadence count. UTC keeps it deterministic in tests
 * regardless of the runner's timezone.
 */
export function startOfCalendarMonthISO(now: number = Date.now()): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

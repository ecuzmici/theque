import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, ItemCategory } from "@/lib/database.types";
import { FORGOTTEN_AFTER_DAYS, getShelf, olderThanCutoff } from "@/lib/shelves";

/**
 * "Your taste in numbers" — a private, read-only aggregation of the signed-in
 * user's library. Headline counts come from exact `head: true` COUNT queries
 * (accurate beyond the projection cap); the distributions are computed in JS
 * from one slim projection of the most recent items, the same shape the Spine
 * Band already relies on (see `LibrarySpineBand`).
 */

/** Slim row projection used for the distribution stats. */
export type StatsItemRow = {
  category: ItemCategory | null;
  status: string;
  domain: string | null;
  dominant_color: string | null;
  dominant_hue: number | null;
  rating_personal: number | null;
  verdict: string | null;
  created_at: string;
};

export type CategoryCount = { category: ItemCategory | "uncategorized"; count: number };
export type RatingCount = { star: number; count: number };
export type HueBucket = { startHue: number; color: string; count: number };
export type DomainCount = { domain: string; count: number };
export type MonthCount = { month: string; label: string; count: number };

export type LibraryStats = {
  /** Non-dismissed items, exact count. */
  totalSaved: number;
  /** Items marked done, exact count. */
  doneCount: number;
  /** done / totalSaved, as a whole percentage. */
  completionPct: number;
  /** `want` items older than the forgotten threshold, exact count. */
  forgottenCount: number;
  /** Rows in the projection the distributions were computed from. */
  sampleSize: number;
  categories: CategoryCount[];
  /** Stars 5 → 1 among rated done items. */
  ratings: RatingCount[];
  ratedDoneCount: number;
  /** Done items rated 4–5. */
  lovedCount: number;
  /** Done items with a written verdict note. */
  verdictCount: number;
  hueHistogram: HueBucket[];
  /** Sampled `dominant_color` values for the decorative hero band. */
  palette: string[];
  topDomains: DomainCount[];
  /** Saves per month, oldest → newest, for the recent window. */
  byMonth: MonthCount[];
};

/** Most recent items pulled for the distributions; matches the Spine Band cap. */
const PROJECTION_LIMIT = 1000;
const HUE_BINS = 12;
const PALETTE_SAMPLE = 64;
const TOP_DOMAINS = 5;
const ACTIVITY_MONTHS = 6;

/**
 * Evenly samples `items` down to at most `max` entries via stride sampling.
 * A local copy of the Spine Band's helper so the stats lib stays decoupled from
 * that `"use client"` component.
 */
export function sampleEvenly<T>(items: T[], max: number): T[] {
  if (max <= 0) return [];
  if (items.length <= max) return items;
  const stride = Math.ceil(items.length / max);
  const sampled: T[] = [];
  for (let i = 0; i < items.length; i += stride) {
    sampled.push(items[i]);
  }
  return sampled;
}

export function computeCategoryCounts(rows: StatsItemRow[]): CategoryCount[] {
  const counts = new Map<ItemCategory | "uncategorized", number>();
  for (const row of rows) {
    const key = row.category ?? "uncategorized";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

export function computeRatingDistribution(rows: StatsItemRow[]): {
  ratings: RatingCount[];
  ratedDoneCount: number;
  lovedCount: number;
} {
  const byStar = new Map<number, number>();
  let ratedDoneCount = 0;
  let lovedCount = 0;
  for (const row of rows) {
    if (row.status !== "done") continue;
    const value = row.rating_personal;
    if (value == null || !Number.isFinite(value)) continue;
    const star = Math.round(value);
    if (star < 1 || star > 5) continue;
    byStar.set(star, (byStar.get(star) ?? 0) + 1);
    ratedDoneCount += 1;
    if (star >= 4) lovedCount += 1;
  }
  const ratings = [5, 4, 3, 2, 1].map((star) => ({ star, count: byStar.get(star) ?? 0 }));
  return { ratings, ratedDoneCount, lovedCount };
}

export function computeHueHistogram(rows: StatsItemRow[], bins = HUE_BINS): HueBucket[] {
  const width = 360 / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const row of rows) {
    const hue = row.dominant_hue;
    if (hue == null || !Number.isFinite(hue)) continue;
    const normalized = ((hue % 360) + 360) % 360;
    let index = Math.floor(normalized / width);
    if (index >= bins) index = bins - 1;
    counts[index] += 1;
  }
  return counts.map((count, i) => ({
    startHue: Math.round(i * width),
    // A representative, lightly muted swatch at the bucket's center hue.
    color: `hsl(${Math.round((i + 0.5) * width)}, 58%, 56%)`,
    count,
  }));
}

/** Drops a leading `www.` and lower-cases so sources group cleanly. */
export function normalizeDomain(domain: string): string {
  return domain.replace(/^www\./i, "").toLowerCase();
}

export function computeTopDomains(rows: StatsItemRow[], limit = TOP_DOMAINS): DomainCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.domain) continue;
    const domain = normalizeDomain(row.domain);
    if (!domain) continue;
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, limit);
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function computeMonthlyActivity(
  rows: StatsItemRow[],
  months = ACTIVITY_MONTHS,
  now = new Date(),
): MonthCount[] {
  const window: { month: string; label: string }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    window.push({
      month: monthKey(d.getUTCFullYear(), d.getUTCMonth()),
      label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    });
  }
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.created_at) continue;
    const d = new Date(row.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = monthKey(d.getUTCFullYear(), d.getUTCMonth());
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return window.map((w) => ({ ...w, count: counts.get(w.month) ?? 0 }));
}

export function computeVerdictCount(rows: StatsItemRow[]): number {
  return rows.filter(
    (row) => row.status === "done" && !!row.verdict && row.verdict.trim().length > 0,
  ).length;
}

export function samplePalette(rows: StatsItemRow[], max = PALETTE_SAMPLE): string[] {
  const colors = rows
    .map((row) => row.dominant_color)
    .filter((color): color is string => Boolean(color));
  return sampleEvenly(colors, max);
}

/**
 * Reflect the signed-in user's library back to them. RLS scopes every query to
 * the caller, so no explicit `user_id` filter is needed.
 */
export async function fetchLibraryStats(
  supabase: SupabaseClient<Database>,
): Promise<LibraryStats> {
  const forgotten = getShelf("forgotten").filter;
  const forgottenCutoff = olderThanCutoff(
    forgotten.olderThanDays ?? FORGOTTEN_AFTER_DAYS,
  ).toISOString();

  let forgottenQuery = supabase
    .from("items")
    .select("id", { count: "exact", head: true });
  if (forgotten.status) forgottenQuery = forgottenQuery.eq("status", forgotten.status);
  forgottenQuery = forgottenQuery.lt("created_at", forgottenCutoff);

  const [totalRes, doneRes, forgottenRes, projectionRes] = await Promise.all([
    supabase.from("items").select("id", { count: "exact", head: true }).neq("status", "dismissed"),
    supabase.from("items").select("id", { count: "exact", head: true }).eq("status", "done"),
    forgottenQuery,
    supabase
      .from("items")
      .select(
        "category, status, domain, dominant_color, dominant_hue, rating_personal, verdict, created_at",
      )
      .neq("status", "dismissed")
      .order("created_at", { ascending: false })
      .limit(PROJECTION_LIMIT),
  ]);

  const totalSaved = totalRes.count ?? 0;
  const doneCount = doneRes.count ?? 0;
  const forgottenCount = forgottenRes.count ?? 0;
  const rows = (projectionRes.data ?? []) as StatsItemRow[];

  const { ratings, ratedDoneCount, lovedCount } = computeRatingDistribution(rows);

  return {
    totalSaved,
    doneCount,
    completionPct: totalSaved > 0 ? Math.round((doneCount / totalSaved) * 100) : 0,
    forgottenCount,
    sampleSize: rows.length,
    categories: computeCategoryCounts(rows),
    ratings,
    ratedDoneCount,
    lovedCount,
    verdictCount: computeVerdictCount(rows),
    hueHistogram: computeHueHistogram(rows),
    palette: samplePalette(rows),
    topDomains: computeTopDomains(rows),
    byMonth: computeMonthlyActivity(rows),
  };
}

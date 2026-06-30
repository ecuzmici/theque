import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, ItemCategory, ItemStatus } from "@/lib/database.types";
import { CATEGORY_LABELS } from "@/lib/item-labels";

/** Slim projection the Wrapped recap aggregates over. */
export type WrappedItemRow = {
  created_at: string;
  done_at: string | null;
  category: ItemCategory | null;
  domain: string | null;
  dominant_hue: number | null;
  dominant_color: string | null;
  rating_personal: number | null;
  verdict: string | null;
  title: string | null;
  status: ItemStatus;
};

export type WrappedPeriod = {
  /** A full calendar year once the library has enough in it; otherwise all-time. */
  kind: "year" | "all-time";
  /** Display token: the year ("2026") or "so far". */
  label: string;
};

export type WrappedCategory = {
  category: ItemCategory;
  label: string;
  count: number;
};

export type WrappedStandout = {
  title: string | null;
  category: ItemCategory | null;
  domain: string | null;
  dominantColor: string | null;
  rating: number | null;
  verdict: string | null;
};

export type WrappedData = {
  /** No non-dismissed items at all — render an inviting placeholder, not a broken page. */
  isEmpty: boolean;
  period: WrappedPeriod;
  totalSaved: number;
  finishedCount: number;
  busiestMonth: { label: string; count: number } | null;
  topCategories: WrappedCategory[];
  /** Up to `PALETTE_SWATCHES` representative colors, walked around the hue wheel. */
  paletteColors: string[];
  colorCount: number;
  standoutPick: WrappedStandout | null;
  topDomain: { domain: string; count: number } | null;
  /** The underlying query hit its cap, so figures cover the most-recent slice. */
  truncated: boolean;
};

/** A year needs at least this many saves to be worth framing as "Your <year>". */
export const MIN_ITEMS_FOR_YEAR = 5;
/** Colors shown in the palette band. */
export const PALETTE_SWATCHES = 28;
/** Cap on rows pulled for aggregation (matches the Spine Band's bound). */
export const WRAPPED_ROW_CAP = 1500;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Evenly sample `n` items across `arr` (keeps first & last), preserving order. */
function sampleEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  if (n <= 1) return arr.slice(0, n);
  const out: T[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
  }
  return out;
}

function topEntry(counts: Map<string, number>): { key: string; count: number } | null {
  let best: { key: string; count: number } | null = null;
  for (const [key, count] of counts) {
    if (!best || count > best.count) best = { key, count };
  }
  return best;
}

/**
 * Reflect a library back to its owner. Pure over the supplied rows so it is
 * unit-testable; the window is the current calendar year once the library is
 * substantial, otherwise all-time so a fresh account still gets a recap.
 */
export function computeWrapped(
  rows: WrappedItemRow[],
  now: Date,
  truncated = false,
): WrappedData {
  const year = now.getFullYear();
  const thisYear = rows.filter((r) => yearOf(r.created_at) === year);
  const useYear = thisYear.length >= MIN_ITEMS_FOR_YEAR;
  const period: WrappedPeriod = useYear
    ? { kind: "year", label: String(year) }
    : { kind: "all-time", label: "so far" };
  const windowRows = useYear ? thisYear : rows;

  if (rows.length === 0) {
    return {
      isEmpty: true,
      period,
      totalSaved: 0,
      finishedCount: 0,
      busiestMonth: null,
      topCategories: [],
      paletteColors: [],
      colorCount: 0,
      standoutPick: null,
      topDomain: null,
      truncated,
    };
  }

  // Busiest month.
  const monthCounts = new Map<string, number>();
  for (const r of windowRows) {
    const d = new Date(r.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
  }
  const busiest = topEntry(monthCounts);
  let busiestMonth: WrappedData["busiestMonth"] = null;
  if (busiest) {
    const [y, m] = busiest.key.split("-").map(Number);
    const label = useYear ? MONTHS[m] : `${MONTHS[m]} ${y}`;
    busiestMonth = { label, count: busiest.count };
  }

  // Top categories.
  const categoryCounts = new Map<ItemCategory, number>();
  for (const r of windowRows) {
    if (!r.category) continue;
    categoryCounts.set(r.category, (categoryCounts.get(r.category) ?? 0) + 1);
  }
  const topCategories: WrappedCategory[] = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, label: CATEGORY_LABELS[category], count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5);

  // Palette of the year — colors walked around the hue wheel.
  const colored = windowRows.filter((r) => !!r.dominant_color);
  const sortedByHue = [...colored].sort(
    (a, b) => (a.dominant_hue ?? 999) - (b.dominant_hue ?? 999),
  );
  const paletteColors = sampleEvenly(sortedByHue, PALETTE_SWATCHES)
    .map((r) => r.dominant_color)
    .filter((c): c is string => !!c);

  // Items finished in the window.
  const finishedCount = windowRows.filter((r) => !!r.done_at).length;

  // Standout pick: highest personal rating, else most recently finished.
  const standoutPick = pickStandout(windowRows);

  // Most-saved source.
  const domainCounts = new Map<string, number>();
  for (const r of windowRows) {
    const d = (r.domain ?? "").trim();
    if (!d) continue;
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }
  const topDomainEntry = topEntry(domainCounts);
  const topDomain = topDomainEntry
    ? { domain: topDomainEntry.key, count: topDomainEntry.count }
    : null;

  return {
    isEmpty: false,
    period,
    totalSaved: windowRows.length,
    finishedCount,
    busiestMonth,
    topCategories,
    paletteColors,
    colorCount: colored.length,
    standoutPick,
    topDomain,
    truncated,
  };
}

function yearOf(iso: string): number | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}

function toStandout(r: WrappedItemRow): WrappedStandout {
  return {
    title: r.title,
    category: r.category,
    domain: r.domain,
    dominantColor: r.dominant_color,
    rating: r.rating_personal,
    verdict: r.verdict,
  };
}

function pickStandout(rows: WrappedItemRow[]): WrappedStandout | null {
  const rated = rows
    .filter((r) => typeof r.rating_personal === "number")
    .sort(
      (a, b) =>
        (b.rating_personal ?? 0) - (a.rating_personal ?? 0) ||
        doneTime(b) - doneTime(a),
    );
  if (rated.length > 0) return toStandout(rated[0]);

  const finished = rows
    .filter((r) => !!r.done_at)
    .sort((a, b) => doneTime(b) - doneTime(a));
  if (finished.length > 0) return toStandout(finished[0]);

  return null;
}

function doneTime(r: WrappedItemRow): number {
  if (!r.done_at) return 0;
  const t = new Date(r.done_at).getTime();
  return Number.isNaN(t) ? 0 : t;
}

const WRAPPED_COLUMNS =
  "created_at, done_at, category, domain, dominant_hue, dominant_color, rating_personal, verdict, title, status";

/** Fetch the signed-in user's rows (RLS-scoped) and fold them into a recap. */
export async function fetchWrappedData(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<WrappedData> {
  const { data, error } = await supabase
    .from("items")
    .select(WRAPPED_COLUMNS)
    .neq("status", "dismissed")
    .order("created_at", { ascending: false })
    .limit(WRAPPED_ROW_CAP);

  if (error) throw error;

  const rows = (data ?? []) as unknown as WrappedItemRow[];
  return computeWrapped(rows, now, rows.length >= WRAPPED_ROW_CAP);
}

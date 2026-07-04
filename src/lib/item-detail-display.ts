import type { ItemCategory, Json } from "@/lib/database.types";
import { formatItemMetadataValue } from "@/lib/item-labels";

/**
 * Presentation rules for enricher output on the item-detail screen.
 *
 * Pure module: no React, no component imports. It owns, per {@link ItemCategory},
 * which structured fields are promoted into the header byline, which are curated
 * into the Details table (and in what order), and how each value is formatted.
 * Issue #71 / ADR 0014.
 */

export interface DetailField {
  key: string;
  label: string;
  value: string;
}

/** Keys that are noise for humans — never a byline segment, never a Details row. */
const SUPPRESSED_KEYS = new Set([
  "site_name",
  "media_type",
  "original_type",
  "rating_scale",
]);

/** Keys whose value is a runtime/duration in whole minutes. */
const MINUTE_KEYS = new Set([
  "runtime_minutes",
  "cook_time_minutes",
  "prep_time_minutes",
]);

interface CategoryConfig {
  /** Curated Details rows, in display order. */
  detailOrder: string[];
  /** Keys shown in the byline, so they must be excluded from Details. */
  promoted: string[];
  /** Clean labels for curated keys; falls back to humanize() otherwise. */
  labels: Record<string, string>;
}

const CATEGORY_CONFIG: Partial<Record<ItemCategory, CategoryConfig>> = {
  books: {
    detailOrder: ["authors", "publisher", "isbn"],
    promoted: [
      "published_year",
      "page_count",
      "average_rating",
      "ratings_count",
      "rating",
    ],
    labels: { authors: "Authors", publisher: "Publisher", isbn: "ISBN" },
  },
  movies_and_tv: {
    detailOrder: ["directors"],
    promoted: ["year", "genres", "runtime_minutes", "rating"],
    labels: { directors: "Directors" },
  },
  articles: {
    detailOrder: ["publisher", "cook_time_minutes", "prep_time_minutes", "yield", "rating"],
    promoted: ["author", "published_at"],
    labels: {
      publisher: "Publisher",
      cook_time_minutes: "Cook time",
      prep_time_minutes: "Prep time",
      yield: "Yield",
      rating: "Rating",
    },
  },
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 93 → "1 h 33 m", 60 → "1 h", 45 → "45 m", 120 → "2 h". */
export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours} h ${mins} m`;
  if (hours) return `${hours} h`;
  return `${mins} m`;
}

/** 1 → "1 page", 455 → "455 pages". */
export function formatPageCount(count: number): string {
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

function formatThousands(value: number): string {
  return value.toLocaleString("en-US");
}

/** Book byline rating: "★ 4.13 · 36,490 ratings", or "★ 4.13", or null. */
function formatBookRating(average: unknown, count: unknown): string | null {
  if (!isNumber(average)) return null;
  let text = `★ ${average}`;
  if (isNumber(count)) {
    text += ` · ${formatThousands(count)} ${count === 1 ? "rating" : "ratings"}`;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Generic value formatting (matches the legacy StructuredFields behavior)
// ---------------------------------------------------------------------------

function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatGenericValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return formatItemMetadataValue(key, value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.every((x) => typeof x === "string" || typeof x === "number")) {
      return value.join(", ");
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Value formatting for a Details row: category-aware helpers, then generic. */
function formatDetailValue(key: string, value: unknown): string {
  if (MINUTE_KEYS.has(key) && isNumber(value)) return formatRuntime(value);
  if (key === "page_count" && isNumber(value)) return formatPageCount(value);
  if ((key === "rating" || key === "average_rating") && isNumber(value)) {
    return `★ ${value}`;
  }
  return formatGenericValue(key, value);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function asRecord(structured: Json | null): Record<string, unknown> | null {
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) {
    return null;
  }
  return structured as Record<string, unknown>;
}

/**
 * Byline segments for the header, already formatted, in category order.
 * Segments whose source key is absent are skipped.
 */
export function getHeadlineFacts(
  category: ItemCategory | null,
  structured: Json | null,
): string[] {
  const obj = asRecord(structured);
  if (!obj) return [];

  const facts: string[] = [];

  if (category === "movies_and_tv") {
    if (obj.year != null) facts.push(String(obj.year));
    if (Array.isArray(obj.genres) && obj.genres.length) {
      facts.push(obj.genres.join(", "));
    }
    if (isNumber(obj.runtime_minutes)) facts.push(formatRuntime(obj.runtime_minutes));
    if (isNumber(obj.rating)) facts.push(`★ ${obj.rating}`);
  } else if (category === "books") {
    if (obj.published_year != null) facts.push(String(obj.published_year));
    if (isNumber(obj.page_count)) facts.push(formatPageCount(obj.page_count));
    const rating = formatBookRating(obj.average_rating, obj.ratings_count);
    if (rating) facts.push(rating);
  } else if (category === "articles") {
    if (obj.published_at != null) {
      const year = String(obj.published_at).match(/\d{4}/);
      if (year) facts.push(year[0]);
    }
    if (typeof obj.author === "string" && obj.author.trim()) facts.push(obj.author);
  }

  return facts;
}

/**
 * Curated Details-table rows in display order: curated keys first (per category),
 * then any unknown non-suppressed keys appended in insertion order so new
 * resolver fields never silently disappear (ADR 0014).
 */
export function getDetailFields(
  category: ItemCategory | null,
  structured: Json | null,
  omitKeys?: string[],
): DetailField[] {
  const obj = asRecord(structured);
  if (!obj) return [];

  const config = category ? CATEGORY_CONFIG[category] : undefined;
  const curatedOrder = config?.detailOrder ?? [];
  const promoted = new Set(config?.promoted ?? []);
  const omit = new Set(omitKeys ?? []);

  const isVisible = (key: string): boolean =>
    Boolean(key) &&
    !key.startsWith("_") &&
    !omit.has(key) &&
    !SUPPRESSED_KEYS.has(key);

  const rows: DetailField[] = [];
  const used = new Set<string>();

  for (const key of curatedOrder) {
    if (!(key in obj) || !isVisible(key)) continue;
    rows.push({
      key,
      label: config?.labels[key] ?? humanize(key),
      value: formatDetailValue(key, obj[key]),
    });
    used.add(key);
  }

  for (const [key, value] of Object.entries(obj)) {
    if (used.has(key) || promoted.has(key) || !isVisible(key)) continue;
    rows.push({ key, label: humanize(key), value: formatDetailValue(key, value) });
  }

  return rows;
}

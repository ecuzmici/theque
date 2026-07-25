/**
 * Shared contract for bulk import.
 *
 * Every importer — CSV preset, user-supplied column mapping, bookmark HTML —
 * targets `ImportRow`. Nothing downstream of a parser should need to know which
 * source a row came from, so this module is deliberately free of source-specific
 * concepts (no shelves, no "to-read", no per-site rating scales).
 */

import type { ItemCategory, ItemStatus } from "@/lib/database.types";

/**
 * Provenance for one imported row.
 *
 * `raw_rating` keeps the pre-normalization value so a mis-mapped scale is
 * debuggable after the fact — `rating_personal` alone cannot tell you whether a
 * 4 came from 4/5, 8/10 or 4 stars.
 */
export type ImportSourceRef = {
  /** Importer id, e.g. `"netscape-bookmarks"` or `"url-list"`. */
  importer: string;
  /** Stable id in the source system (Goodreads book id, IMDb const, …). */
  external_id?: string | null;
  /** Original rating cell, before scale normalization. */
  raw_rating?: string | null;
  /** File name the row came from (matters for multi-file archives). */
  file?: string | null;
  /** 1-based line/record number in the source file, when knowable. */
  line?: number | null;
};

/**
 * One importable item.
 *
 * `url` is kept **raw**. Canonicalization, fingerprinting and dedup are the
 * ingest layer's job (`src/lib/url/`), not the parser's — a parser that
 * normalizes eagerly destroys the evidence needed to explain a dropped row.
 */
export type ImportRow = {
  /** REQUIRED, raw. Parsers must not normalize. */
  url: string;
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  image_url?: string | null;
  /** `null` means "let `src/lib/classify/` decide". */
  category?: ItemCategory | null;
  /** Defaults to `"want"` when a parser has no better signal. */
  status?: ItemStatus;
  /** ALREADY normalized to 1..5 by the parser (see `./rating`). */
  rating_personal?: number | null;
  /** Free-text note; truncated to `MAX_NOTE_LENGTH` at the parser boundary. */
  verdict?: string | null;
  /** ISO-8601. */
  done_at?: string | null;
  /** ISO-8601 hint for when the user originally saved this. */
  created_at_hint?: string | null;
  /** Tags / shelves / folders. Accepted as no-ops today (see AGENTS.md). */
  labels?: string[];
  source_ref: ImportSourceRef;
};

/**
 * A row the parser refused, with a reason a UI can show verbatim.
 *
 * This is load-bearing: an importer that silently drops 40% of a file destroys
 * trust faster than one that fails outright. Every rejection gets a reason.
 */
export type ImportSkip = {
  /** 1-based line/record number, when knowable. */
  line?: number;
  /** Short machine-ish reason, e.g. `"missing_url"`. */
  reason: string;
  /** Truncated source text, for the user to recognise the row. */
  raw?: string;
};

export type ImportParseResult = {
  rows: ImportRow[];
  skipped: ImportSkip[];
  /** File-level notes (duplicate headers, row cap hit, unknown columns, …). */
  warnings: string[];
};

/**
 * What a parser is handed.
 *
 * `text` is the decoded file. `bytes` is optional and only populated for
 * container formats (a Letterboxd ZIP, say) that cannot be read as text.
 */
export type ImportInput = {
  text: string;
  filename?: string | null;
  bytes?: Uint8Array | null;
};

export type Importer = {
  id: string;
  label: string;
  /** Lower-case extensions including the dot, e.g. `[".csv"]`. */
  accepts: string[];
  /** Content/header sniffing for auto-detection. Must not throw. */
  detect(input: ImportInput): boolean;
  parse(input: ImportInput): Promise<ImportParseResult>;
};

/** Default status for a saved-but-not-consumed item. */
export const DEFAULT_IMPORT_STATUS: ItemStatus = "want";

/** Hard cap on rows read from one file, to bound memory and insert batches. */
export const IMPORT_MAX_ROWS = 5000;

/**
 * Cap on recorded skips. A pathological file should not produce a
 * multi-megabyte error payload; the overflow is reported as a warning instead.
 */
export const IMPORT_MAX_SKIPS = 200;

export const IMPORT_SKIP_REASONS = {
  missingUrl: "missing_url",
  invalidUrl: "invalid_url",
  unsupportedScheme: "unsupported_scheme",
  urlTooLong: "url_too_long",
  emptyRow: "empty_row",
} as const;

export function fileExtensionOf(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return null;
  return filename.slice(dot).toLowerCase();
}

/** Category is only ever set from a value the app already knows. */
export function isItemCategory(value: unknown): value is ItemCategory {
  return (
    value === "books" ||
    value === "movies_and_tv" ||
    value === "restaurants" ||
    value === "products" ||
    value === "travel" ||
    value === "recipes" ||
    value === "articles"
  );
}

export function isItemStatus(value: unknown): value is ItemStatus {
  return value === "inbox" || value === "want" || value === "done" || value === "dismissed";
}

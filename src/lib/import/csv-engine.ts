/**
 * Generic CSV import engine.
 *
 * The point of this module is that adding a new source is a **column mapping**,
 * not a parser. A preset is ~15 lines of declarative config (see
 * `./presets/url-list.ts`); all the grubby work — RFC-4180 quoting, BOM, CRLF,
 * duplicate headers, Excel's `="…"` escaping, rating-scale normalization, skip
 * accounting — lives here once.
 *
 * Parsing is delegated to papaparse. Splitting on commas by hand is the single
 * most likely source of silent corruption in this feature: review text with
 * commas, embedded quotes and literal newlines inside quoted fields is a
 * certainty in any real Goodreads or Letterboxd export, not an edge case.
 */

import Papa from "papaparse";

import type { ItemCategory, ItemStatus } from "@/lib/database.types";

import {
  DEFAULT_IMPORT_STATUS,
  IMPORT_MAX_ROWS,
  IMPORT_MAX_SKIPS,
  IMPORT_SKIP_REASONS,
  isItemCategory,
  isItemStatus,
  type ImportInput,
  type ImportParseResult,
  type ImportRow,
  type ImportSkip,
  type Importer,
} from "@/lib/import/types";
import {
  resolveRatingNormalizer,
  type RatingNormalizer,
  type RatingScaleId,
} from "@/lib/import/rating";
import {
  classifyUrl,
  cleanValue,
  collapseWhitespace,
  dedupeLabels,
  isTooLongUrl,
  looksLikeHttpUrl,
  splitLabels,
  stripBom,
  toIsoDate,
  truncateNote,
  truncateRawSnippet,
  truncateTitle,
} from "@/lib/import/value";

/** Columns a mapping falls back to when it does not name a URL column. */
export const DEFAULT_URL_COLUMNS = ["url", "link", "address", "href", "permalink", "uri"];

// ---------------------------------------------------------------------------
// Header handling
// ---------------------------------------------------------------------------

export type CsvHeaderOption = {
  /**
   * `"present"` (default) treats record 0 as headers, `"absent"` synthesizes
   * them, `"auto"` decides by looking for a URL in record 0 — a header row
   * never contains one.
   */
  mode?: "present" | "absent" | "auto";
  /** Names used when headers are synthesized, padded with `column_N`. */
  synthetic?: string[];
};

/**
 * Normalize a header for lookup: case, BOM, Excel escape, and `_`/`-` folded to
 * spaces so a preset can write `"Time Added"` and match `time_added`.
 */
export function normalizeHeader(raw: string | null | undefined): string {
  const cleaned = cleanValue(raw);
  if (cleaned === null) return "";
  return cleaned.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export type CsvRowContext = {
  /** 1-based record number in the file (approximates the line). */
  line: number;
  /** Resolved header names, in file order. */
  headers: string[];
  values: string[];
  /** Cleaned cell for a column name, or `null` when absent/blank. */
  get(column: string): string | null;
  /** First non-blank cell across several candidate columns. */
  getAny(columns: string[]): string | null;
};

// ---------------------------------------------------------------------------
// Field mapping
// ---------------------------------------------------------------------------

/**
 * How one `ImportRow` field is produced.
 *
 * Shorthand `"Title"` or `["Title", "Name"]` reads the first non-blank of those
 * columns. The object form adds a `derive` hook for values that have to be
 * computed — building a URL from an id column, mapping a shelf name to a
 * status, or reading two columns at once via the row context.
 */
export type CsvFieldSpec<T> =
  | string
  | string[]
  | {
      columns?: string[];
      /** Used when the columns yield nothing (or `derive` returns `undefined`). */
      fallback?: T | null;
      derive?: (value: string | null, row: CsvRowContext) => T | null | undefined;
    };

export type CsvRatingSpec = {
  columns: string[];
  /** Named scale (`"ten"`, `"half_stars"`, …) or a custom normalizer. */
  scale: RatingScaleId | RatingNormalizer;
};

export type CsvLabelsSpec = {
  columns: string[];
  /** Defaults to `,`, `;` or `|`. */
  separator?: RegExp | string;
  /** Drop labels already expressed elsewhere (e.g. a shelf mapped to status). */
  exclude?: (label: string) => boolean;
};

export type CsvColumnMapping = {
  url?: CsvFieldSpec<string>;
  title?: CsvFieldSpec<string>;
  subtitle?: CsvFieldSpec<string>;
  description?: CsvFieldSpec<string>;
  image_url?: CsvFieldSpec<string>;
  category?: CsvFieldSpec<ItemCategory>;
  status?: CsvFieldSpec<ItemStatus>;
  rating?: CsvRatingSpec;
  verdict?: CsvFieldSpec<string>;
  done_at?: CsvFieldSpec<string>;
  created_at_hint?: CsvFieldSpec<string>;
  labels?: CsvLabelsSpec | string | string[];
  external_id?: CsvFieldSpec<string>;
};

export type CsvRowDefaults = {
  category?: ItemCategory | null;
  status?: ItemStatus;
};

/**
 * Reject a row before any field is read, with the reason shown to the user.
 *
 * Returning `null` keeps the row. This exists because some sources carry an
 * identifier that is structurally unusable rather than absent — StoryGraph's
 * `ISBN/UID` column holds an Amazon ASIN for Kindle editions, which would
 * otherwise become `https://openlibrary.org/isbn/B08XYZ…`, a 404 for every such
 * row. Letting the URL derivation return `null` would report those as
 * `missing_url`, which sends the user looking for a blank cell that is not
 * there; a rule states the real reason instead.
 */
export type CsvRowSkipRule = (row: CsvRowContext) => string | null;

export type CsvPreset = {
  id: string;
  label: string;
  /** Extensions this preset accepts. Defaults to `[".csv"]`. */
  accepts?: string[];
  /**
   * Normalized column names that must all be present for auto-detection.
   * An empty signature means "detect by `detect()` alone".
   */
  signature: string[];
  /** Extra sniffing on the resolved headers, ANDed with `signature`. */
  detect?: (headers: string[], input: ImportInput) => boolean;
  header?: CsvHeaderOption;
  defaults?: CsvRowDefaults;
  /** Optional pre-flight rejection rule (see `CsvRowSkipRule`). */
  skipRow?: CsvRowSkipRule;
  mapping: CsvColumnMapping;
};

export type CsvParseOptions = {
  /** Importer id recorded in `source_ref.importer`. */
  importer?: string;
  header?: CsvHeaderOption;
  defaults?: CsvRowDefaults;
  skipRow?: CsvRowSkipRule;
  /** Force a delimiter; omitted means papaparse auto-detects (`,`/`;`/tab). */
  delimiter?: string;
  maxRows?: number;
};

// ---------------------------------------------------------------------------
// Low-level read
// ---------------------------------------------------------------------------

export type CsvTable = {
  headers: string[];
  /** Normalized header per column, aligned with `headers`. */
  normalizedHeaders: string[];
  /** Data records, excluding the header row. */
  records: string[][];
  /** Record number (1-based) of `records[i]` in the file. */
  recordNumbers: number[];
  warnings: string[];
};

function isBlankRecord(record: string[]): boolean {
  return record.every((cell) => cleanValue(cell) === null);
}

function synthesizeHeaders(width: number, synthetic: string[] | undefined): string[] {
  const out: string[] = [];
  for (let i = 0; i < width; i += 1) {
    out.push(synthetic?.[i] ?? `column_${i + 1}`);
  }
  return out;
}

/**
 * Read a CSV file into a header-indexed table.
 *
 * Headers are resolved but **not** deduplicated away: a duplicate column keeps
 * its first occurrence (later ones are unreachable by name) and raises a
 * warning, rather than silently last-wins the way `header: true` parsers do.
 */
export function readCsvTable(text: string, options: CsvParseOptions = {}): CsvTable {
  const warnings: string[] = [];
  const source = stripBom(text);

  const parsed = Papa.parse<string[]>(source, {
    header: false,
    // Empty records are filtered below so record numbers stay true to the file.
    skipEmptyLines: false,
    delimiter: options.delimiter,
    newline: undefined,
  });

  for (const error of parsed.errors.slice(0, 5)) {
    const at = typeof error.row === "number" ? ` (record ${error.row + 1})` : "";
    warnings.push(`CSV parse warning${at}: ${error.message}`);
  }
  if (parsed.errors.length > 5) {
    warnings.push(`${parsed.errors.length - 5} further CSV parse warnings were omitted.`);
  }

  const all = parsed.data.filter((record) => Array.isArray(record));
  if (all.length === 0) {
    return { headers: [], normalizedHeaders: [], records: [], recordNumbers: [], warnings };
  }

  const mode = options.header?.mode ?? "present";
  const firstNonBlank = all.findIndex((record) => !isBlankRecord(record));
  const headerRecord = firstNonBlank >= 0 ? all[firstNonBlank] : all[0];
  const headerless =
    mode === "absent" ||
    (mode === "auto" && headerRecord.some((cell) => looksLikeHttpUrl(cell)));

  const headers = headerless
    ? synthesizeHeaders(headerRecord.length, options.header?.synthetic)
    : headerRecord.map((cell, index) => cleanValue(cell) ?? `column_${index + 1}`);
  const normalizedHeaders = headers.map((header, index) =>
    normalizeHeader(header) || `column_${index + 1}`,
  );

  const seen = new Set<string>();
  for (const header of normalizedHeaders) {
    if (seen.has(header)) {
      warnings.push(
        `Duplicate column "${header}" — only the first occurrence is used.`,
      );
    }
    seen.add(header);
  }

  const records: string[][] = [];
  const recordNumbers: number[] = [];
  const dataStart = headerless ? 0 : (firstNonBlank >= 0 ? firstNonBlank : 0) + 1;
  const maxRows = options.maxRows ?? IMPORT_MAX_ROWS;

  for (let i = dataStart; i < all.length; i += 1) {
    const record = all[i];
    if (isBlankRecord(record)) continue;
    if (records.length >= maxRows) {
      warnings.push(
        `Only the first ${maxRows} rows were read; the file contains more.`,
      );
      break;
    }
    records.push(record);
    recordNumbers.push(i + 1);
  }

  return { headers, normalizedHeaders, records, recordNumbers, warnings };
}

/** Resolved header names, for a column-mapping UI to offer as choices. */
export function readCsvHeaders(text: string, options: CsvParseOptions = {}): string[] {
  return readCsvTable(text, { ...options, maxRows: 1 }).headers;
}

function makeRowContext(table: CsvTable, index: number): CsvRowContext {
  const values = table.records[index];
  const line = table.recordNumbers[index];

  const columnIndex = new Map<string, number>();
  for (let i = 0; i < table.normalizedHeaders.length; i += 1) {
    const key = table.normalizedHeaders[i];
    if (!columnIndex.has(key)) columnIndex.set(key, i);
  }

  const get = (column: string): string | null => {
    const index = columnIndex.get(normalizeHeader(column));
    if (index === undefined) return null;
    return cleanValue(values[index]);
  };

  return {
    line,
    headers: table.headers,
    values,
    get,
    getAny(columns: string[]): string | null {
      for (const column of columns) {
        const value = get(column);
        if (value !== null) return value;
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Field resolution
// ---------------------------------------------------------------------------

function normalizeFieldSpec<T>(
  spec: CsvFieldSpec<T>,
): { columns: string[]; fallback?: T | null; derive?: (value: string | null, row: CsvRowContext) => T | null | undefined } {
  if (typeof spec === "string") return { columns: [spec] };
  if (Array.isArray(spec)) return { columns: spec };
  return { columns: spec.columns ?? [], fallback: spec.fallback, derive: spec.derive };
}

function readField<T>(
  spec: CsvFieldSpec<T> | undefined,
  row: CsvRowContext,
): T | null {
  if (spec === undefined) return null;
  const { columns, fallback, derive } = normalizeFieldSpec(spec);
  const value = columns.length ? row.getAny(columns) : null;
  if (derive) {
    const derived = derive(value, row);
    if (derived === undefined) return fallback ?? null;
    return derived;
  }
  if (value === null) return fallback ?? null;
  return value as unknown as T;
}

function readLabels(
  spec: CsvColumnMapping["labels"],
  row: CsvRowContext,
): string[] {
  if (!spec) return [];
  const normalized: CsvLabelsSpec =
    typeof spec === "string"
      ? { columns: [spec] }
      : Array.isArray(spec)
        ? { columns: spec }
        : spec;

  const collected: string[] = [];
  for (const column of normalized.columns) {
    collected.push(...splitLabels(row.get(column), normalized.separator));
  }
  const deduped = dedupeLabels(collected);
  return normalized.exclude ? deduped.filter((label) => !normalized.exclude?.(label)) : deduped;
}

// ---------------------------------------------------------------------------
// Mapping application
// ---------------------------------------------------------------------------

export type CsvMappingParseOptions = CsvParseOptions & {
  /** File name recorded in `source_ref.file`. */
  file?: string | null;
};

/**
 * Apply a column mapping to a CSV file.
 *
 * This is the path used both by presets and by a **user-supplied** mapping — a
 * user picking "column C is the URL, column F is a 1..10 rating" builds the same
 * `CsvColumnMapping` a preset ships, so arbitrary CSVs are importable without
 * any new code.
 */
export function parseCsvWithMapping(
  input: ImportInput,
  mapping: CsvColumnMapping,
  options: CsvMappingParseOptions = {},
): ImportParseResult {
  const importer = options.importer ?? "csv";
  const file = options.file ?? input.filename ?? null;
  const table = readCsvTable(input.text, options);

  const rows: ImportRow[] = [];
  const skipped: ImportSkip[] = [];
  const warnings = [...table.warnings];
  let skippedOverflow = 0;

  const addSkip = (skip: ImportSkip): void => {
    if (skipped.length >= IMPORT_MAX_SKIPS) {
      skippedOverflow += 1;
      return;
    }
    skipped.push(skip);
  };

  const urlSpec = mapping.url ?? DEFAULT_URL_COLUMNS;
  const ratingNormalizer = mapping.rating
    ? resolveRatingNormalizer(mapping.rating.scale)
    : null;

  let invalidCategoryWarned = false;
  let invalidStatusWarned = false;

  for (let i = 0; i < table.records.length; i += 1) {
    const row = makeRowContext(table, i);
    const snippet = truncateRawSnippet(row.values.join(", "));

    const ruledOut = options.skipRow?.(row) ?? null;
    if (ruledOut) {
      addSkip({ line: row.line, reason: ruledOut, raw: snippet });
      continue;
    }

    const rawUrl = readField<string>(urlSpec, row);
    const url = typeof rawUrl === "string" ? rawUrl.trim() : null;
    if (!url) {
      addSkip({ line: row.line, reason: IMPORT_SKIP_REASONS.missingUrl, raw: snippet });
      continue;
    }
    if (isTooLongUrl(url)) {
      addSkip({ line: row.line, reason: IMPORT_SKIP_REASONS.urlTooLong, raw: snippet });
      continue;
    }
    const urlKind = classifyUrl(url);
    if (urlKind !== "ok") {
      addSkip({
        line: row.line,
        reason:
          urlKind === "invalid"
            ? IMPORT_SKIP_REASONS.invalidUrl
            : IMPORT_SKIP_REASONS.unsupportedScheme,
        raw: truncateRawSnippet(url),
      });
      continue;
    }

    const rawCategory = readField<ItemCategory>(mapping.category, row);
    let category: ItemCategory | null = options.defaults?.category ?? null;
    if (rawCategory !== null) {
      if (isItemCategory(rawCategory)) {
        category = rawCategory;
      } else if (!invalidCategoryWarned) {
        warnings.push(
          `Ignored unrecognised category values (e.g. "${String(rawCategory)}").`,
        );
        invalidCategoryWarned = true;
      }
    }

    const rawStatus = readField<ItemStatus>(mapping.status, row);
    let status: ItemStatus = options.defaults?.status ?? DEFAULT_IMPORT_STATUS;
    if (rawStatus !== null) {
      if (isItemStatus(rawStatus)) {
        status = rawStatus;
      } else if (!invalidStatusWarned) {
        warnings.push(`Ignored unrecognised status values (e.g. "${String(rawStatus)}").`);
        invalidStatusWarned = true;
      }
    }

    const rawRating = mapping.rating ? row.getAny(mapping.rating.columns) : null;
    const rating = ratingNormalizer ? ratingNormalizer(rawRating) : null;

    const labels = readLabels(mapping.labels, row);
    const doneAt = toIsoDate(readField<string>(mapping.done_at, row));
    const createdAtHint = toIsoDate(readField<string>(mapping.created_at_hint, row));

    rows.push({
      url,
      title: truncateTitle(readField<string>(mapping.title, row)),
      subtitle: truncateTitle(readField<string>(mapping.subtitle, row)),
      description: cleanValue(readField<string>(mapping.description, row)),
      image_url: cleanValue(readField<string>(mapping.image_url, row)),
      category,
      status,
      rating_personal: rating,
      verdict: truncateNote(readField<string>(mapping.verdict, row)),
      // A `done` item with no date is still done; leave the timestamp to ingest.
      done_at: doneAt,
      created_at_hint: createdAtHint,
      labels,
      source_ref: {
        importer,
        external_id: collapseWhitespace(readField<string>(mapping.external_id, row)),
        raw_rating: rawRating,
        file,
        line: row.line,
      },
    });
  }

  if (skippedOverflow > 0) {
    warnings.push(`${skippedOverflow} further skipped rows were not listed individually.`);
  }

  return { rows, skipped, warnings };
}

// ---------------------------------------------------------------------------
// Importer construction
// ---------------------------------------------------------------------------

function presetMatches(preset: CsvPreset, input: ImportInput): boolean {
  let headers: string[];
  try {
    headers = readCsvTable(input.text, { header: preset.header, maxRows: 1 })
      .normalizedHeaders;
  } catch {
    return false;
  }
  if (headers.length === 0) return false;

  const present = new Set(headers);
  for (const column of preset.signature) {
    if (!present.has(normalizeHeader(column))) return false;
  }
  if (preset.detect && !preset.detect(headers, input)) return false;
  return true;
}

/** Wrap a preset as an `Importer`. */
export function csvImporterFromPreset(preset: CsvPreset): Importer {
  return {
    id: preset.id,
    label: preset.label,
    accepts: preset.accepts ?? [".csv"],
    detect: (input) => presetMatches(preset, input),
    parse: async (input) =>
      parseCsvWithMapping(input, preset.mapping, {
        importer: preset.id,
        header: preset.header,
        defaults: preset.defaults,
        skipRow: preset.skipRow,
        file: input.filename ?? null,
      }),
  };
}

/**
 * Wrap a user-supplied column mapping as an `Importer`.
 *
 * `detect` is always `false`: a hand-built mapping is chosen explicitly, never
 * sniffed, so it can never shadow a real preset during auto-detection.
 */
export function csvImporterFromMapping(
  mapping: CsvColumnMapping,
  options: CsvMappingParseOptions & { id?: string; label?: string } = {},
): Importer {
  const id = options.id ?? "csv-custom";
  return {
    id,
    label: options.label ?? "Custom CSV mapping",
    accepts: [".csv", ".tsv", ".txt"],
    detect: () => false,
    parse: async (input) =>
      parseCsvWithMapping(input, mapping, {
        ...options,
        importer: options.importer ?? id,
        file: options.file ?? input.filename ?? null,
      }),
  };
}

/** First preset whose header signature matches, in registry order. */
export function detectCsvPreset(
  input: ImportInput,
  presets: readonly CsvPreset[],
): CsvPreset | null {
  for (const preset of presets) {
    if (presetMatches(preset, input)) return preset;
  }
  return null;
}

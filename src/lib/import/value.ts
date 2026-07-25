/**
 * Small value-cleaning helpers shared by the CSV engine and the HTML parsers.
 *
 * These run at the parser boundary so that everything downstream can assume
 * `ImportRow` fields are already trimmed, length-bounded and ISO-formatted.
 */

import { MAX_NOTE_LENGTH, MAX_TITLE_LENGTH, MAX_URL_LENGTH } from "@/lib/input-limits";

const BOM = "\uFEFF";

/** Strip a UTF-8 BOM from the head of a decoded file. */
export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

/**
 * Unwrap Excel's `="0123456789"` escaping.
 *
 * Goodreads wraps ISBNs this way so Excel does not eat the leading zero or
 * reformat the value as `9.78038E+12`. The escape survives CSV parsing intact,
 * so it has to be peeled off here or every ISBN arrives with `="…"` around it.
 */
export function unwrapExcelEscape(value: string): string {
  // `[\s\S]` rather than the `s` flag: the build targets ES2017.
  const match = /^\s*="([\s\S]*)"\s*$/.exec(value);
  return match ? match[1] : value;
}

/**
 * Normalize one raw cell / text node: BOM, Excel escape, whitespace collapse.
 * Returns `null` for anything that ends up empty.
 */
export function cleanValue(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const unwrapped = unwrapExcelEscape(stripBom(raw));
  const trimmed = unwrapped.trim();
  return trimmed === "" ? null : trimmed;
}

/** Collapse runs of whitespace (including newlines) into single spaces. */
export function collapseWhitespace(raw: string | null | undefined): string | null {
  const cleaned = cleanValue(raw);
  if (cleaned === null) return null;
  const collapsed = cleaned.replace(/\s+/g, " ").trim();
  return collapsed === "" ? null : collapsed;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Bound a free-text note at `MAX_NOTE_LENGTH` (verdict column). */
export function truncateNote(raw: string | null | undefined): string | null {
  const cleaned = cleanValue(raw);
  return cleaned === null ? null : truncate(cleaned, MAX_NOTE_LENGTH);
}

/** Bound a title at `MAX_TITLE_LENGTH` and collapse its whitespace. */
export function truncateTitle(raw: string | null | undefined): string | null {
  const cleaned = collapseWhitespace(raw);
  return cleaned === null ? null : truncate(cleaned, MAX_TITLE_LENGTH);
}

/** Truncate a raw source snippet for display in an `ImportSkip`. */
export function truncateRawSnippet(raw: string, max = 200): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max)}…`;
}

export function isTooLongUrl(url: string): boolean {
  return url.length > MAX_URL_LENGTH;
}

/**
 * Values at or above this magnitude are not Unix timestamps at all.
 *
 * Chrome's internal `Bookmarks` JSON stores `date_added` as **microseconds
 * since the 1601 Windows epoch** (offset `11644473600000000`), which lands
 * around 1.3e16 — a 17-digit number. Users routinely hand over that file
 * thinking it is the bookmark export, so a value this large is evidence of the
 * wrong file rather than a date to be salvaged.
 */
export const BOOKMARK_TIMESTAMP_MAX = 1e15;

export type BookmarkTimestamp =
  | { kind: "none" }
  | { kind: "ok"; iso: string }
  | { kind: "out_of_range"; raw: string };

/**
 * Parse a bookmark-file timestamp.
 *
 * `ADD_DATE` (Netscape) and `time_added` (Pocket) are Unix **seconds** in every
 * implementation that writes them — Chromium, Firefox, Safari and Pocket all
 * agree. Millisecond values still turn up from third-party tools, so they are
 * accepted by magnitude; anything larger is reported as out of range instead of
 * being converted into a year-53000 date.
 */
export function parseBookmarkTimestamp(
  raw: string | number | null | undefined,
): BookmarkTimestamp {
  const text = typeof raw === "number" ? String(raw) : cleanValue(raw);
  if (text === null) return { kind: "none" };
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value <= 0) return { kind: "none" };
  if (value >= BOOKMARK_TIMESTAMP_MAX) return { kind: "out_of_range", raw: text };

  // Unix seconds is the documented unit; milliseconds only from stray tooling.
  const ms = value >= 1e11 ? value : value * 1000;
  const date = new Date(Math.round(ms));
  if (Number.isNaN(date.getTime())) return { kind: "none" };
  return { kind: "ok", iso: date.toISOString() };
}

/** `parseBookmarkTimestamp` for callers that only want the ISO string. */
export function unixTimestampToIso(raw: string | number | null | undefined): string | null {
  const parsed = parseBookmarkTimestamp(raw);
  return parsed.kind === "ok" ? parsed.iso : null;
}

function utcDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Parse a date-ish cell (`2023-04-01`, `2023/04/01`, `Apr 01, 2023`) to ISO.
 * Bare Unix timestamps are handled too, since some exports mix the two.
 *
 * Slash-separated dates are resolved here rather than by `new Date(...)`:
 * `new Date("8/10/2023")` is parsed in the **local** zone, so the same export
 * yields a different `done_at` depending on where the server runs. Goodreads and
 * StoryGraph write `YYYY/MM/DD`; a file round-tripped through Excel writes
 * `M/D/YYYY` (US order — the only order Excel's en-US locale emits), with
 * `D/M/YYYY` accepted as a fallback when the first number cannot be a month.
 */
export function toIsoDate(raw: string | null | undefined): string | null {
  const text = cleanValue(raw);
  if (text === null) return null;
  if (/^\d{9,}$/.test(text)) return unixTimestampToIso(text);

  const isoish = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (isoish) {
    return utcDate(Number(isoish[1]), Number(isoish[2]), Number(isoish[3]));
  }

  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (slashed) {
    const first = Number(slashed[1]);
    const second = Number(slashed[2]);
    const year = Number(slashed[3]);
    return first > 12 ? utcDate(year, second, first) : utcDate(year, first, second);
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/**
 * Strip HTML from an exported review and decode the entities exporters emit.
 *
 * Goodreads' `My Review` and Letterboxd's `Review` are stored as HTML — a long
 * review arrives as `<p>` blocks with `<br/>`, `<i>` and `&quot;` in it. Written
 * to `verdict` unchanged it renders as visible markup, so tags are removed at
 * the parser boundary. Block-level tags become newlines so paragraph breaks
 * survive; inline runs of whitespace are collapsed.
 */
export function htmlToPlainText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const text = raw
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    // `&amp;` last, so `&amp;lt;` does not decode twice into a tag.
    .replace(/&amp;/gi, "&")
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  return cleanValue(text);
}

/** Split a tag-ish cell into distinct, trimmed labels (order preserved). */
export function splitLabels(
  raw: string | null | undefined,
  separator: RegExp | string = /[,;|]/,
): string[] {
  const text = cleanValue(raw);
  if (text === null) return [];
  return dedupeLabels(text.split(separator).map((part) => collapseWhitespace(part)));
}

export function dedupeLabels(labels: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const cleaned = collapseWhitespace(label);
    if (cleaned === null) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

/**
 * Is this a URL we can actually capture?
 *
 * Deliberately validation-only: the raw string is what gets stored, so
 * `src/lib/url/normalize.ts` still owns canonicalization at ingest time.
 */
export function classifyUrl(raw: string): "ok" | "invalid" | "unsupported_scheme" {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "invalid";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "unsupported_scheme";
  }
  return "ok";
}

export function looksLikeHttpUrl(raw: string | null | undefined): boolean {
  const cleaned = cleanValue(raw);
  if (cleaned === null) return false;
  return classifyUrl(cleaned) === "ok";
}

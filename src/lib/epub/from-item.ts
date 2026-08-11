import type { EpubMetadataPatch } from "@/lib/epub/metadata";

const MAX_CREATORS = 5;

/** Only the item columns the EPUB patch reads. */
export type BookItemFields = {
  title: string | null;
  description: string | null;
  structured: Record<string, unknown>;
};

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

/** `structured` comes from resolvers and the LLM, so nothing is type safe. */
function stringArray(value: unknown, limit: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    const trimmed = text(entry);
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out.length ? out : null;
}

/**
 * A book database writes the series into the title, as
 * `The Tainted Cup (Ana and Din Mysteries, #1)`. The suffix always holds a `#`
 * and a number, which a title does not.
 */
const TITLE_SERIES_SUFFIX = /\s*\([^()]*#\d+(\.\d+)?\)\s*$/;

/**
 * Remove the series from the end of the title. A Kobo prints the series field
 * on its own line, so the suffix shows the series two times.
 *
 * The function keeps the suffix when the item has no series, because the suffix
 * is then the only record of it. It also keeps a title that holds nothing else.
 */
function stripSeriesSuffix(title: string, series: string | null): string {
  if (!series) return title;
  return title.replace(TITLE_SERIES_SUFFIX, "").trim() || title;
}

/** A jsonb round trip can turn the index into a string, so accept both. */
function positiveNumber(value: unknown): number | null {
  let parsed: number;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string" && value.trim()) parsed = Number(value);
  else return null;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Map an item onto an EPUB metadata patch.
 * A field stays out of the patch when theque has no value for it, so the
 * EPUB keeps its own metadata. This function never removes EPUB metadata.
 */
export function epubPatchFromItem(item: BookItemFields): EpubMetadataPatch {
  const patch: EpubMetadataPatch = {};

  // Read the series first. The title drops a series it repeats.
  const series = text(item.structured.series);

  const title = text(item.title);
  if (title) patch.title = stripSeriesSuffix(title, series);

  const description = text(item.description);
  if (description) patch.description = description;

  const creators = stringArray(item.structured.authors, MAX_CREATORS);
  if (creators) patch.creators = creators;

  if (series) {
    patch.series = series;
    // An index without a series name is meaningless, so write the pair only.
    const seriesIndex = positiveNumber(item.structured.series_index);
    if (seriesIndex !== null) patch.seriesIndex = seriesIndex;
  }

  return patch;
}

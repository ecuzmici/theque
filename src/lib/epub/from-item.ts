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

  const title = text(item.title);
  if (title) patch.title = title;

  const description = text(item.description);
  if (description) patch.description = description;

  const creators = stringArray(item.structured.authors, MAX_CREATORS);
  if (creators) patch.creators = creators;

  const series = text(item.structured.series);
  if (series) {
    patch.series = series;
    // An index without a series name is meaningless, so write the pair only.
    const seriesIndex = positiveNumber(item.structured.series_index);
    if (seriesIndex !== null) patch.seriesIndex = seriesIndex;
  }

  return patch;
}

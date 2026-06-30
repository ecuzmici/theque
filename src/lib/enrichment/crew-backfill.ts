import type { ResolvedMovie } from "@/lib/recommend/resolve/tmdb";

/**
 * Pure decision logic for the surgical TMDB crew backfill (ADR 0011, issue #42).
 *
 * Given an item's current structured metadata, its LLM field-source provenance,
 * and a TMDB resolution, compute the structured object that should be stored —
 * OVERWRITING (not gap-filling) the fields TMDB is authoritative for. The normal
 * enrichment merge only fills *empty* fields, so a wrong director already in the
 * row would survive it; the backfill exists to overwrite that.
 *
 * Crew on a TMDB miss: a director the LLM sourced from `model_knowledge` is
 * cleared (an honest blank beats a confident fabrication); a page/resolver-sourced
 * or unknown-provenance director is left alone.
 */

export type CrewBackfillInput = {
  structured: Record<string, unknown>;
  /** raw_metadata.llm.field_sources for the item (may be absent). */
  fieldSources?: Record<string, string> | null;
  /** TMDB resolution for the item, or null when TMDB had no match. */
  tmdb: ResolvedMovie | null;
};

export type CrewBackfillResult = {
  nextStructured: Record<string, unknown>;
  changed: boolean;
  /** Per-field record of what changed, prior → next, for audit/reversal. */
  log: Record<string, { prior: unknown; next: unknown }>;
};

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The structured fields TMDB authoritatively supplies, mapped to the
 * movies_and_tv schema — mirrors `resolveMovie` so the backfill and the live
 * resolver agree on shapes (rating on a 0–5 scale, rating_scale = 5).
 */
function tmdbAuthoritativeFields(tmdb: ResolvedMovie | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!tmdb) return out;
  if (tmdb.directors && tmdb.directors.length > 0) out.directors = tmdb.directors;
  if (
    typeof tmdb.runtime_minutes === "number" &&
    Number.isInteger(tmdb.runtime_minutes) &&
    tmdb.runtime_minutes > 0
  ) {
    out.runtime_minutes = tmdb.runtime_minutes;
  }
  if (tmdb.genres && tmdb.genres.length > 0) out.genres = tmdb.genres;
  if (typeof tmdb.source_rating === "number") {
    out.rating = tmdb.source_rating;
    out.rating_scale = 5;
  }
  return out;
}

function hasDirectors(structured: Record<string, unknown>): boolean {
  const d = structured.directors;
  if (d === undefined || d === null) return false;
  if (Array.isArray(d)) return d.length > 0;
  return true;
}

export function computeCrewBackfill(input: CrewBackfillInput): CrewBackfillResult {
  const { structured, fieldSources, tmdb } = input;
  const next = { ...structured };
  const log: Record<string, { prior: unknown; next: unknown }> = {};

  // 1. Overwrite every field TMDB authoritatively provides.
  const authoritative = tmdbAuthoritativeFields(tmdb);
  for (const [key, value] of Object.entries(authoritative)) {
    if (!sameValue(structured[key], value)) {
      log[key] = { prior: structured[key] ?? null, next: value };
      next[key] = value;
    }
  }

  // 2. Crew on a miss: if TMDB did not supply directors, clear a memory-sourced
  //    value (blank beats wrong); keep page/resolver-sourced or unknown ones.
  if (!("directors" in authoritative)) {
    if (hasDirectors(structured) && fieldSources?.directors === "model_knowledge") {
      log.directors = { prior: structured.directors, next: null };
      delete next.directors;
    }
  }

  return { nextStructured: next, changed: Object.keys(log).length > 0, log };
}

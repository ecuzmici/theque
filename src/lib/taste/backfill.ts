import type { ItemCategory } from "@/lib/database.types";

import { deriveGenreKeys } from "./derive-genres";
import type { TaggerResult } from "./tagger";

// Pure helpers for the two taste backfill scripts (ADR 0020, decision 6).
// The scripts read and write the database. This module does no input or output.

export type TasteFields = {
  /** A patch. At apply time the script merges these top-level keys into the stored `structured`. */
  structured?: Record<string, unknown>;
  genre_keys?: string[];
  mood_keys?: string[];
  taste_tagged_at?: string | null;
};

export type ProposalRow = {
  id: string;
  /** Shown to the reviewer only. The apply step ignores it. */
  title: string | null;
  /** The current value of each field that `after` sets. */
  before: TasteFields;
  after: TasteFields;
};

export type BackfillItemRow = {
  id: string;
  category: ItemCategory | null;
  title: string | null;
  description: string | null;
  structured: unknown;
  genre_keys: string[] | null;
  mood_keys: string[] | null;
  taste_tagged_at: string | null;
};

export type BackupRow = {
  id: string;
  structured: unknown;
  genre_keys: string[] | null;
  mood_keys: string[] | null;
  taste_tagged_at: string | null;
};

export type ApplyPlan = {
  writes: { id: string; patch: Record<string, unknown> }[];
  backups: BackupRow[];
  skipped: { id: string; reason: string }[];
};

export const BACKFILL_CATEGORIES = ["books", "movies_and_tv"] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Treat null, undefined and an empty array as the same "no value". */
function normalizeValue(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value) && value.length === 0) return "null";
  return JSON.stringify(value);
}

export function sameValue(a: unknown, b: unknown): boolean {
  return normalizeValue(a) === normalizeValue(b);
}

export function sameKeys(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
  return sameValue(a ?? [], b ?? []);
}

export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Phase 1 for one item: derive genre keys from `structured.genres`. Returns
 * null when the result is empty or equals the stored keys. An empty result
 * keeps the stored keys.
 */
export function genreKeyChange(row: BackfillItemRow): ProposalRow | null {
  if (row.category !== "books" && row.category !== "movies_and_tv") return null;
  const derived = deriveGenreKeys(row.category, asRecord(row.structured).genres);
  if (derived.length === 0 || sameKeys(derived, row.genre_keys)) return null;
  return {
    id: row.id,
    title: row.title,
    before: { genre_keys: row.genre_keys ?? [] },
    after: { genre_keys: derived },
  };
}

/**
 * Phase 2 for one item: combine the phase 1 change with the tagger result.
 * The LLM genre keys apply only when the item has no genre key after phase 1.
 */
export function mergeTagResult(
  row: BackfillItemRow,
  phase1: ProposalRow | null,
  result: TaggerResult,
  taggedAt: string,
): ProposalRow {
  const currentGenres = row.genre_keys ?? [];
  const genreAfterPhase1 = phase1?.after.genre_keys ?? currentGenres;
  const before: TasteFields = {
    mood_keys: row.mood_keys ?? [],
    taste_tagged_at: row.taste_tagged_at,
  };
  const after: TasteFields = { mood_keys: result.mood_keys, taste_tagged_at: taggedAt };

  let genres = genreAfterPhase1;
  if (genres.length === 0 && result.genre_keys.length > 0) genres = result.genre_keys;
  if (!sameKeys(genres, currentGenres)) {
    before.genre_keys = currentGenres;
    after.genre_keys = genres;
  }
  return { id: row.id, title: row.title, before, after };
}

/** Phase 1 over all rows. */
export function buildGenreKeyProposal(rows: readonly BackfillItemRow[]): ProposalRow[] {
  return rows.map(genreKeyChange).filter((p): p is ProposalRow => p !== null);
}

/**
 * Book genre backfill for one book: merge found genres into `structured.genres`
 * and derive genre keys. Returns null when no genre was found or the book
 * already has genres.
 */
export function bookGenreChange(row: BackfillItemRow, foundGenres: readonly string[]): ProposalRow | null {
  if (row.category !== "books" || foundGenres.length === 0) return null;
  const structured = asRecord(row.structured);
  if (stringList(structured.genres).length > 0) return null;

  const genres = [...foundGenres];
  const before: TasteFields = { structured: { genres: structured.genres ?? null } };
  const after: TasteFields = { structured: { genres } };

  const derived = deriveGenreKeys("books", genres);
  if (derived.length > 0 && !sameKeys(derived, row.genre_keys)) {
    before.genre_keys = row.genre_keys ?? [];
    after.genre_keys = derived;
  }
  return { id: row.id, title: row.title, before, after };
}

/** True for a book whose `structured.genres` is missing or empty. */
export function needsBookGenres(row: BackfillItemRow): boolean {
  return row.category === "books" && stringList(asRecord(row.structured).genres).length === 0;
}

export type ProposalSummary = {
  rows: number;
  keysPerRow: { min: number; max: number; mean: number };
  genreHistogram: Record<string, number>;
  moodHistogram: Record<string, number>;
};

function bump(histogram: Record<string, number>, keys: readonly string[] | undefined) {
  for (const key of keys ?? []) histogram[key] = (histogram[key] ?? 0) + 1;
}

/** Sort a histogram by count, highest first. */
export function sortedHistogram(histogram: Record<string, number>): [string, number][] {
  return Object.entries(histogram).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function summarizeProposal(proposal: readonly ProposalRow[]): ProposalSummary {
  const genreHistogram: Record<string, number> = {};
  const moodHistogram: Record<string, number> = {};
  const counts: number[] = [];
  for (const row of proposal) {
    bump(genreHistogram, row.after.genre_keys);
    bump(moodHistogram, row.after.mood_keys);
    counts.push((row.after.genre_keys?.length ?? 0) + (row.after.mood_keys?.length ?? 0));
  }
  const total = counts.reduce((sum, n) => sum + n, 0);
  return {
    rows: proposal.length,
    keysPerRow: {
      min: counts.length ? Math.min(...counts) : 0,
      max: counts.length ? Math.max(...counts) : 0,
      mean: counts.length ? Math.round((total / counts.length) * 100) / 100 : 0,
    },
    genreHistogram,
    moodHistogram,
  };
}

const FIELD_NAMES = ["structured", "genre_keys", "mood_keys", "taste_tagged_at"] as const;

/** Validate a proposal file. Throws on a bad shape so --apply never writes half a file. */
export function parseProposal(json: unknown): ProposalRow[] {
  if (!Array.isArray(json)) throw new Error("proposal must be a JSON array");
  const seen = new Set<string>();
  return json.map((entry, index) => {
    const row = asRecord(entry);
    if (typeof row.id !== "string" || row.id === "") throw new Error(`row ${index}: id missing`);
    if (seen.has(row.id)) throw new Error(`row ${index}: duplicate id ${row.id}`);
    seen.add(row.id);
    const before = asRecord(row.before);
    const after = asRecord(row.after);
    const keys = Object.keys(after);
    if (keys.length === 0) throw new Error(`row ${index}: after is empty`);
    for (const key of keys) {
      if (!(FIELD_NAMES as readonly string[]).includes(key)) throw new Error(`row ${index}: unknown field ${key}`);
    }
    for (const field of ["genre_keys", "mood_keys"] as const) {
      if (field in after && !Array.isArray(after[field])) throw new Error(`row ${index}: ${field} must be an array`);
    }
    if ("taste_tagged_at" in after && after.taste_tagged_at !== null && typeof after.taste_tagged_at !== "string") {
      throw new Error(`row ${index}: taste_tagged_at must be a string`);
    }
    if ("structured" in after && (typeof after.structured !== "object" || after.structured === null)) {
      throw new Error(`row ${index}: structured must be an object`);
    }
    return {
      id: row.id,
      title: typeof row.title === "string" ? row.title : null,
      before: before as TasteFields,
      after: after as TasteFields,
    };
  });
}

function currentFieldMatches(field: (typeof FIELD_NAMES)[number], current: BackupRow, before: TasteFields): boolean {
  if (field === "structured") {
    const stored = asRecord(current.structured);
    const expected = asRecord(before.structured);
    return Object.keys(expected).every((key) => sameValue(stored[key], expected[key]));
  }
  return sameValue(current[field], before[field]);
}

/**
 * Build the write list from a proposal and the current rows. A row is skipped
 * when it is gone or when a field that the proposal sets changed since the dry
 * run. The backup holds the current values of each row that will change.
 */
export function buildApplyPlan(proposal: readonly ProposalRow[], currentRows: readonly BackupRow[]): ApplyPlan {
  const byId = new Map(currentRows.map((row) => [row.id, row]));
  const plan: ApplyPlan = { writes: [], backups: [], skipped: [] };

  for (const row of proposal) {
    const current = byId.get(row.id);
    if (!current) {
      plan.skipped.push({ id: row.id, reason: "row not found" });
      continue;
    }
    const changed = FIELD_NAMES.find((field) => field in row.after && !currentFieldMatches(field, current, row.before));
    if (changed) {
      plan.skipped.push({ id: row.id, reason: `${changed} changed since the dry run` });
      continue;
    }

    const patch: Record<string, unknown> = {};
    for (const field of FIELD_NAMES) {
      if (!(field in row.after)) continue;
      patch[field] =
        field === "structured" ? { ...asRecord(current.structured), ...asRecord(row.after.structured) } : row.after[field];
    }
    plan.writes.push({ id: row.id, patch });
    plan.backups.push({
      id: current.id,
      structured: current.structured,
      genre_keys: current.genre_keys,
      mood_keys: current.mood_keys,
      taste_tagged_at: current.taste_tagged_at,
    });
  }
  return plan;
}

export type BackfillArgs = {
  apply: boolean;
  from: string | null;
  outDir: string;
  limit: number | null;
  maxCalls: number;
};

function readOption(args: readonly string[], name: string): string | null {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : null;
}

function readCount(args: readonly string[], name: string): number | null {
  const raw = readOption(args, name);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${name} must be a positive integer`);
  return parsed;
}

/** Parse the shared CLI options. Accepts `--name value` and `--name=value`. */
export function parseBackfillArgs(args: readonly string[]): BackfillArgs {
  const apply = args.includes("--apply");
  const from = readOption(args, "from");
  if (apply && !from) throw new Error("--apply needs --from <proposal.json>");
  if (!apply && from) throw new Error("--from works only with --apply");
  return {
    apply,
    from,
    outDir: readOption(args, "out-dir") ?? ".backfill",
    limit: readCount(args, "limit"),
    maxCalls: readCount(args, "max-calls") ?? 40,
  };
}

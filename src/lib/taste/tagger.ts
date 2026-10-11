import "server-only";

import { generateJsonWithFallback } from "@/lib/ai/gateway";
import type { ItemCategory } from "@/lib/database.types";
import {
  ENRICHMENT_PROVIDER_OPTIONS,
  enrichmentModels,
  enrichmentTimeoutMs,
} from "@/lib/enrichment/llm/llm-config";

import { deriveGenreKeys } from "./derive-genres";
import { BOOK_GENRES, MOODS, type BookGenreKey, type MoodKey } from "./taste-lists";

// The tagging call (ADR 0020, decision 5). One call tags up to 10 items.
// The call never sends `note` or `verdict`. Both are private (ADR 0013).

export const TAGGER_BATCH_SIZE = 10;
export const TAGGER_DESCRIPTION_MAX = 600;
const MAX_KEYS = 3;

export type TaggerCategory = Extract<ItemCategory, "books" | "movies_and_tv">;

export type TaggerInput = {
  id: string;
  category: TaggerCategory;
  title: string;
  creator: string | null;
  year: number | null;
  rawGenres: string[];
  description: string | null;
};

export type TaggerResult = {
  id: string;
  mood_keys: MoodKey[];
  /** Book genre keys. Empty unless the item is a book with no deterministic genre key. */
  genre_keys: BookGenreKey[];
};

export function isTaggerCategory(category: unknown): category is TaggerCategory {
  return category === "books" || category === "movies_and_tv";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Build the tagger input from an item row. Returns null for a category that
 * has no tags or for an item without a title. Reads no encrypted field.
 */
export function taggerInputFromItem(row: {
  id: string;
  category: ItemCategory | null;
  title: string | null;
  description: string | null;
  structured: unknown;
}): TaggerInput | null {
  if (!isTaggerCategory(row.category)) return null;
  const title = row.title?.trim();
  if (!title) return null;
  const structured = asRecord(row.structured);
  const people = strings(row.category === "books" ? structured.authors : structured.directors);
  const year = positiveInt(row.category === "books" ? structured.published_year : structured.year);
  return {
    id: row.id,
    category: row.category,
    title,
    creator: people.length > 0 ? people.slice(0, 2).join(", ") : null,
    year,
    rawGenres: strings(structured.genres),
    description: row.description?.trim() || null,
  };
}

/** True when the tagger must pick genre keys: a book with no deterministic key. */
export function needsLlmGenres(item: Pick<TaggerInput, "category" | "rawGenres">): boolean {
  return item.category === "books" && deriveGenreKeys("books", item.rawGenres).length === 0;
}

const MOOD_KEYS = MOODS.map((m) => m.key);
const BOOK_GENRE_KEYS = BOOK_GENRES.map((g) => g.key);

export const TAGGER_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          mood_keys: {
            type: "array",
            items: { type: "string", enum: MOOD_KEYS },
            maxItems: MAX_KEYS,
          },
          genre_keys: {
            type: "array",
            items: { type: "string", enum: BOOK_GENRE_KEYS },
            maxItems: MAX_KEYS,
          },
        },
        required: ["id", "mood_keys", "genre_keys"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const MOOD_DEFINITIONS: Record<MoodKey, string> = {
  cozy: "warm, gentle, comforting, low stakes",
  funny: "made to make you laugh",
  heartfelt: "sincere, tender, emotionally moving",
  dark: "grim, bleak or morally heavy",
  tense: "suspense that keeps you on edge",
  eerie: "unsettling, haunting, uncanny",
  "mind-bending": "twisty, puzzling, bends reality or time",
  "slow-burn": "patient, gradual, atmospheric pacing",
  epic: "grand in scale, sweeping in scope",
  "thought-provoking": "leaves you with ideas to argue about",
};

/** Cut text to a maximum length at a space when one is near the end. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.8 ? cut.slice(0, space) : cut}…`;
}

export function buildTaggerPrompt(items: TaggerInput[]): string {
  const moods = MOODS.map((m) => `- ${m.key}: ${MOOD_DEFINITIONS[m.key]}`).join("\n");
  const genres = BOOK_GENRES.map((g) => g.key).join(", ");
  const lines = items.map((item) =>
    JSON.stringify({
      id: item.id,
      category: item.category === "books" ? "book" : "film or show",
      title: item.title,
      creator: item.creator,
      year: item.year,
      genres: item.rawGenres,
      description: item.description ? clip(item.description, TAGGER_DESCRIPTION_MAX) : null,
      pick_genre_keys: needsLlmGenres(item),
    }),
  );
  return [
    "Tag each item below with moods and, for some books, genres.",
    "",
    `Moods (pick 0 to ${MAX_KEYS} per item, only when they clearly fit; the first is the strongest):`,
    moods,
    "",
    `Genre keys for books (${genres}):`,
    `- When pick_genre_keys is true, pick 1 to ${MAX_KEYS} genre keys.`,
    "- When pick_genre_keys is false, return an empty genre_keys array.",
    "",
    "Rules:",
    "- Use only the listed keys.",
    "- Judge from the title, the creator and the description. Use what you know about the work.",
    "- Return one entry for each item. Copy its id exactly.",
    "",
    "Items, one JSON object per line:",
    ...lines,
  ].join("\n");
}

function pickKeys<K extends string>(raw: unknown, allowed: ReadonlySet<string>): K[] {
  if (!Array.isArray(raw)) return [];
  const out: K[] = [];
  for (const value of raw) {
    if (typeof value !== "string" || !allowed.has(value) || out.includes(value as K)) continue;
    out.push(value as K);
    if (out.length >= MAX_KEYS) break;
  }
  return out;
}

const ALLOWED_MOODS: ReadonlySet<string> = new Set(MOOD_KEYS);
const ALLOWED_BOOK_GENRES: ReadonlySet<string> = new Set(BOOK_GENRE_KEYS);

/**
 * Validate the model output. Drops unknown ids, duplicate ids, unknown keys and
 * keys past 3 for each list. Drops genre keys for an item that did not ask for
 * them. An item that the model left out has no result.
 */
export function parseTaggerOutput(data: unknown, items: TaggerInput[]): TaggerResult[] {
  const raw = asRecord(data).items;
  if (!Array.isArray(raw)) return [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const results: TaggerResult[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const id = record.id;
    if (typeof id !== "string" || seen.has(id)) continue;
    const item = byId.get(id);
    if (!item) continue;
    seen.add(id);
    results.push({
      id,
      mood_keys: pickKeys<MoodKey>(record.mood_keys, ALLOWED_MOODS),
      genre_keys: needsLlmGenres(item)
        ? pickKeys<BookGenreKey>(record.genre_keys, ALLOWED_BOOK_GENRES)
        : [],
    });
  }
  return results;
}

/**
 * Tag up to 10 items with one gateway call. Throws when every model fails.
 * The caller decides what to do with an item that has no result.
 */
export async function tagItems(items: TaggerInput[]): Promise<TaggerResult[]> {
  if (items.length === 0) return [];
  if (items.length > TAGGER_BATCH_SIZE) throw new Error("tagger_batch_too_large");
  const { data } = await generateJsonWithFallback<unknown>({
    models: enrichmentModels(),
    prompt: buildTaggerPrompt(items),
    schema: TAGGER_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.2,
    timeoutMs: enrichmentTimeoutMs(),
    providerOptions: ENRICHMENT_PROVIDER_OPTIONS,
    label: "taste-tag",
  });
  return parseTaggerOutput(data, items);
}

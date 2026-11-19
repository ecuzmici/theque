import type { ItemCategory, Json } from "@/lib/database.types";
import { getDetailFields, getHeadlineFacts } from "@/lib/item-detail-display";

/** Detail keys that name the creator. The subtitle often repeats them. */
const CREATOR_KEYS = ["authors", "author", "directors", "creators", "brand"];

function isWordChar(char: string | undefined): boolean {
  return char != null && /[\p{L}\p{N}]/u.test(char);
}

/** True when `text` contains `fact` as a whole word or phrase, ignoring case. */
export function mentions(text: string, fact: string): boolean {
  const needle = fact.trim().toLowerCase();
  if (!needle) return true;
  const hay = text.toLowerCase();
  let at = hay.indexOf(needle);
  while (at !== -1) {
    if (!isWordChar(hay[at - 1]) && !isWordChar(hay[at + needle.length])) return true;
    at = hay.indexOf(needle, at + 1);
  }
  return false;
}

/**
 * One byline for the detail header: the subtitle, then each headline fact the
 * subtitle does not already state. "Nolan · 2010" plus facts ["2010", "2 h 28 m"]
 * gives "Nolan · 2010 · 2 h 28 m", so the year shows one time.
 */
export function getDetailByline(
  category: ItemCategory | null,
  subtitle: string | null,
  structured: Json | null,
): string | null {
  const parts: string[] = [];
  const sub = subtitle?.trim();
  if (sub) parts.push(sub);
  for (const fact of getHeadlineFacts(category, structured)) {
    if (!mentions(parts.join(" · "), fact)) parts.push(fact);
  }
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Creator keys the byline already states, so the Details table can omit them.
 * A list value ("A, B") counts only when the byline names every entry.
 */
export function getBylineDetailKeys(
  category: ItemCategory | null,
  structured: Json | null,
  byline: string | null,
): string[] {
  if (!byline) return [];
  return getDetailFields(category, structured)
    .filter((field) => CREATOR_KEYS.includes(field.key))
    .filter((field) => {
      const names = field.value.split(/\s*,\s*/).filter(Boolean);
      return names.length > 0 && names.every((name) => mentions(byline, name));
    })
    .map((field) => field.key);
}

/** Structured keys that hold the people a byline can link to, per category. */
const LINKED_CREATOR_KEYS: Partial<Record<ItemCategory, string>> = {
  books: "authors",
  movies_and_tv: "directors",
};

export type BylineSegment = { text: string; creator?: string };

/** Start index of `name` as a whole word or phrase in `text`, ignoring case. -1 if absent. */
function wholeWordIndex(text: string, name: string): number {
  const hay = text.toLowerCase();
  const needle = name.toLowerCase();
  let at = hay.indexOf(needle);
  while (at !== -1) {
    if (!isWordChar(hay[at - 1]) && !isWordChar(hay[at + needle.length])) return at;
    at = hay.indexOf(needle, at + 1);
  }
  return -1;
}

/**
 * Splits the byline so the header can link each author (books) or director
 * (movies and TV) to a library search. A segment with `creator` holds a name
 * from the structured data. Other text stays in plain segments.
 */
export function splitBylineByCreators(
  category: ItemCategory | null,
  byline: string,
  structured: Json | null,
): BylineSegment[] {
  const key = category ? LINKED_CREATOR_KEYS[category] : undefined;
  const obj =
    structured && typeof structured === "object" && !Array.isArray(structured)
      ? (structured as Record<string, unknown>)
      : null;
  const raw = key && obj ? obj[key] : null;
  const names = (Array.isArray(raw) ? raw : [])
    .filter((name): name is string => typeof name === "string" && name.trim() !== "")
    .map((name) => name.trim());

  const matches = names
    .map((name) => ({ name, at: wholeWordIndex(byline, name) }))
    .filter((match) => match.at !== -1)
    .sort((a, b) => a.at - b.at);

  const segments: BylineSegment[] = [];
  let cursor = 0;
  for (const { name, at } of matches) {
    if (at < cursor) continue; // Overlaps an earlier name.
    if (at > cursor) segments.push({ text: byline.slice(cursor, at) });
    segments.push({ text: byline.slice(at, at + name.length), creator: name });
    cursor = at + name.length;
  }
  if (cursor < byline.length) segments.push({ text: byline.slice(cursor) });
  return segments;
}

/** True when white text reads better than near-black text on this hex color. */
export function prefersLightText(color: string): boolean {
  const match = color
    .trim()
    .replace(/^#/, "")
    .match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return true;
  const [r, g, b] = [match[1], match[2], match[3]].map((hex) => {
    const channel = parseInt(hex!, 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! < 0.4;
}

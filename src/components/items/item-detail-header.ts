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

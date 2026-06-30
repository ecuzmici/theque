/**
 * Mood / colour browse: bucket library items by the `dominant_hue` /
 * `dominant_color` extracted at enrichment time into a small, pleasing set of
 * named palette "moods". Pure + framework-free so it can be unit-tested and
 * reused by the server page and the client view alike.
 *
 * Hue is degrees on the colour wheel (0–360), matching `hueFromRgb` in
 * `src/lib/enrichment/image-cache.ts`. `dominant_color` is a hex string.
 */

export type MoodId =
  | "reds"
  | "ambers"
  | "greens"
  | "blues"
  | "purples"
  | "neutrals"
  | "uncolored";

export type Mood = {
  id: MoodId;
  label: string;
  blurb: string;
  /** Representative swatch for the chip + section header. */
  swatch: string;
};

/**
 * Ordered to walk a pleasing spectrum (reds → ambers → greens → blues →
 * purples), then the achromatic neutrals, then the "no colour yet" fallback.
 * Rendering always follows this order regardless of bucket sizes.
 */
export const MOODS: readonly Mood[] = [
  { id: "reds", label: "Reds & warms", blurb: "Crimsons, scarlets, rich warm covers.", swatch: "#d1495b" },
  { id: "ambers", label: "Ambers & golds", blurb: "Oranges, yellows, sunlit tones.", swatch: "#d99a2b" },
  { id: "greens", label: "Greens", blurb: "Leaf, sage, forest, teal-leaning.", swatch: "#4f9d69" },
  { id: "blues", label: "Blues & calm", blurb: "Sky, ocean, cool and quiet.", swatch: "#4f7fd9" },
  { id: "purples", label: "Purples & pinks", blurb: "Violets, magentas, dusk hues.", swatch: "#8a5cd9" },
  { id: "neutrals", label: "Neutrals & monochrome", blurb: "Greys, near-black, near-white.", swatch: "#9b9b9b" },
  { id: "uncolored", label: "No colour yet", blurb: "Covers we haven't drawn a colour from.", swatch: "transparent" },
] as const;

export function getMood(id: MoodId): Mood {
  return MOODS.find((m) => m.id === id) ?? MOODS[MOODS.length - 1];
}

/** Covers whose dominant colour is this washed-out are read as neutral, not chromatic. */
const NEUTRAL_MAX_SATURATION = 0.15;
const NEAR_BLACK_LIGHTNESS = 0.08;
const NEAR_WHITE_LIGHTNESS = 0.95;

function normalizeHex(hex: string): string | null {
  const t = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  if (/^[0-9a-fA-F]{3}$/.test(t)) {
    return t
      .split("")
      .map((c) => c + c)
      .join("")
      .toLowerCase();
  }
  return null;
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  const r = parseInt(norm.slice(0, 2), 16) / 255;
  const g = parseInt(norm.slice(2, 4), 16) / 255;
  const b = parseInt(norm.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/** Wrap any hue into [0, 360). Returns null for non-finite input. */
export function normalizeHue(hue: number | null | undefined): number | null {
  if (hue == null || !Number.isFinite(hue)) return null;
  return ((hue % 360) + 360) % 360;
}

function chromaticMoodForHue(hue: number): MoodId {
  if (hue >= 345 || hue < 15) return "reds";
  if (hue < 60) return "ambers";
  if (hue < 160) return "greens";
  if (hue < 250) return "blues";
  return "purples"; // 250 ≤ hue < 345
}

export type ColoredItem = {
  dominant_hue: number | null;
  dominant_color: string | null;
};

export function moodForItem(item: ColoredItem): MoodId {
  const hsl = item.dominant_color ? hexToHsl(item.dominant_color) : null;

  // Nothing to go on at all → the gentle fallback bucket.
  if (item.dominant_hue == null && !hsl) return "uncolored";

  // Washed-out / near-black / near-white covers read as neutral whatever their hue.
  if (
    hsl &&
    (hsl.s < NEUTRAL_MAX_SATURATION ||
      hsl.l <= NEAR_BLACK_LIGHTNESS ||
      hsl.l >= NEAR_WHITE_LIGHTNESS)
  ) {
    return "neutrals";
  }

  const hue = normalizeHue(item.dominant_hue) ?? (hsl ? normalizeHue(hsl.h) : null);
  if (hue == null) return "uncolored";
  return chromaticMoodForHue(hue);
}

export type MoodBucket<T extends ColoredItem> = {
  mood: Mood;
  items: T[];
};

/**
 * Group items into spectrum-ordered mood buckets, dropping any empty bucket.
 * Item order within a bucket is preserved from the input (callers pass items
 * already hue-sorted, so each bucket reads as a smooth gradient).
 */
export function bucketByMood<T extends ColoredItem>(items: T[]): MoodBucket<T>[] {
  const grouped = new Map<MoodId, T[]>();
  for (const item of items) {
    const id = moodForItem(item);
    const arr = grouped.get(id);
    if (arr) arr.push(item);
    else grouped.set(id, [item]);
  }
  return MOODS.map((mood) => ({ mood, items: grouped.get(mood.id) ?? [] })).filter(
    (bucket) => bucket.items.length > 0,
  );
}

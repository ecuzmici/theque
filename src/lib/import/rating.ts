/**
 * Rating-scale normalization for bulk import.
 *
 * `items.rating_personal` is a smallint 1..5. Sources are all over the place:
 * IMDb and MyAnimeList use 1..10, Letterboxd and StoryGraph use half-stars,
 * Calibre stores 0..10 internally, Untappd uses quarter-stars. Parsers must
 * never emit a foreign scale — they call one of these helpers.
 *
 * ## The rule that matters
 *
 * **`0` means *unrated*, not one star.** Goodreads, MyAnimeList, Discogs and
 * Paprika all write `0` into the rating column for items the user never rated,
 * and a large export is mostly unrated rows. Importing those as 1★ would feed
 * thousands of fabricated "I hated this" signals into the verdict-driven taste
 * profile (`src/lib/recommend/taste-profile.ts`, ADR 0002) — the one signal the
 * product is actually built on. Every helper here maps `0`, blank, absent and
 * non-numeric input to `null`.
 */

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export type RatingNormalizer = (raw: unknown) => number | null;

/**
 * Coerce a raw cell to a positive finite number.
 *
 * Returns `null` for blank, non-numeric, zero and negative input — i.e. every
 * shape of "the user did not rate this".
 */
export function toRatingNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw;
  }
  if (typeof raw !== "string") return null;

  // Tolerate Excel's ="4" escaping and decimal commas ("4,5" in EU locales).
  let text = raw.trim();
  const excel = /^="(.*)"$/.exec(text);
  if (excel) text = excel[1].trim();
  text = text.replace(/^"(.*)"$/, "$1").trim();
  if (!text) return null;
  if (/^\d+,\d+$/.test(text)) text = text.replace(",", ".");

  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function clamp(value: number): number {
  if (value < MIN_RATING) return MIN_RATING;
  if (value > MAX_RATING) return MAX_RATING;
  return value;
}

/** Clamp an already-integral rating into 1..5. Exposed for parser use. */
export function clampRating(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return clamp(Math.round(value));
}

/**
 * 1..10 → 1..5, pairing up: 1,2→1  3,4→2  5,6→3  7,8→4  9,10→5.
 * Used by IMDb, Trakt, Simkl and MyAnimeList.
 */
export const fromTen: RatingNormalizer = (raw) => {
  const value = toRatingNumber(raw);
  if (value === null) return null;
  return clamp(Math.ceil(Math.min(value, 10) / 2));
};

/**
 * 0.5..5.0 in half-steps → nearest whole star (Letterboxd, StoryGraph).
 * 0.5 rounds up to 1 rather than down to 0 — a half-star is still a rating.
 */
export const fromHalfStars: RatingNormalizer = (raw) => {
  const value = toRatingNumber(raw);
  if (value === null) return null;
  return clamp(Math.round(value));
};

/** 0..5 whole stars (Goodreads, Discogs, Paprika). `0` is unrated. */
export const fromFive: RatingNormalizer = (raw) => {
  const value = toRatingNumber(raw);
  if (value === null) return null;
  return clamp(Math.round(value));
};

/** Calibre's internal 0..10 (two units per star) → 1..5. */
export const fromCalibre: RatingNormalizer = (raw) => {
  const value = toRatingNumber(raw);
  if (value === null) return null;
  return clamp(Math.round(Math.min(value, 10) / 2));
};

/**
 * 1..5 in 0.25 steps (StoryGraph's `Star Rating`, Untappd) → nearest whole star.
 * StoryGraph leaves the cell **empty** for an unrated book rather than writing
 * `0`, which `toRatingNumber` already maps to `null`.
 */
export const fromQuarterStars: RatingNormalizer = (raw) => {
  const value = toRatingNumber(raw);
  if (value === null) return null;
  return clamp(Math.round(value));
};

/**
 * Named scales, so a preset (or a user-supplied column mapping built in a UI
 * dropdown) can reference a normalizer by string instead of by function.
 */
export const RATING_SCALES = {
  five: fromFive,
  ten: fromTen,
  half_stars: fromHalfStars,
  quarter_stars: fromQuarterStars,
  calibre: fromCalibre,
} as const;

export type RatingScaleId = keyof typeof RATING_SCALES;

export function isRatingScaleId(value: unknown): value is RatingScaleId {
  return typeof value === "string" && value in RATING_SCALES;
}

export function resolveRatingNormalizer(
  scale: RatingScaleId | RatingNormalizer,
): RatingNormalizer {
  return typeof scale === "function" ? scale : RATING_SCALES[scale];
}

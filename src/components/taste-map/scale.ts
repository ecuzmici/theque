// Sequential blue scale for a mean rating (dataviz reference ramp). Low ratings
// sit near the surface and high ratings stand out, in light and in dark mode.

/** Sets the five --tm-N steps and --tm-none on a wrapper element. */
export const RATING_SCALE_VARS = [
  "[--tm-0:#b7d3f6] [--tm-1:#86b6ef] [--tm-2:#5598e7] [--tm-3:#2a78d6] [--tm-4:#104281] [--tm-none:#e7e5e4]",
  "dark:[--tm-0:#184f95] dark:[--tm-1:#1c5cab] dark:[--tm-2:#3987e5] dark:[--tm-3:#6da7ec] dark:[--tm-4:#b7d3f6] dark:[--tm-none:#44403c]",
].join(" ");

export const RATING_STEPS = ["under 3", "3 to 3.5", "3.5 to 4", "4 to 4.5", "4.5 and up"] as const;

/** The scale step (0-4) of a mean rating, or null when nothing has a rating. */
export function ratingStep(avg: number | null): number | null {
  if (avg === null) return null;
  if (avg < 3) return 0;
  if (avg < 3.5) return 1;
  if (avg < 4) return 2;
  if (avg < 4.5) return 3;
  return 4;
}

export function ratingFill(avg: number | null): string {
  const step = ratingStep(avg);
  return step === null ? "var(--tm-none)" : `var(--tm-${step})`;
}

/** Same scale for a count, against the largest count on screen. */
export function countFill(count: number, max: number): string {
  if (count <= 0 || max <= 0) return "transparent";
  const step = Math.min(4, Math.floor((Math.sqrt(count) / Math.sqrt(max)) * 4.999));
  return `var(--tm-${step})`;
}

export function formatRating(avg: number | null): string {
  return avg === null ? "no ratings" : `${avg.toFixed(1)}★`;
}

// Sequential amber scale for counts, built on the app accent (ADR 0019). The
// dataviz ordinal validator passes both ramps: monotone lightness, a step gap
// of 0.06 or more, one hue, and 2:1 or more for the faint end on the card.
// Light mode goes from light to dark. Dark mode goes from dark to light, so a
// large count stands out on both surfaces. Each step has its own text color,
// picked by APCA (white or ink, whichever is stronger).

/** Sets --tm-N (fill) and --tm-N-ink (text) for steps 0-4 on a wrapper element. */
export const COUNT_SCALE_VARS = [
  "[--tm-0:#f59e0b] [--tm-1:#d97706] [--tm-2:#b45309] [--tm-3:#8f3f0d] [--tm-4:#6a2c09]",
  "[--tm-0-ink:#1c1917] [--tm-1-ink:#fff] [--tm-2-ink:#fff] [--tm-3-ink:#fff] [--tm-4-ink:#fff]",
  "dark:[--tm-0:#8f3f0d] dark:[--tm-1:#b45309] dark:[--tm-2:#d97706] dark:[--tm-3:#f59e0b] dark:[--tm-4:#fdc86a]",
  "dark:[--tm-0-ink:#fff] dark:[--tm-1-ink:#fff] dark:[--tm-2-ink:#fff] dark:[--tm-3-ink:#1c1917] dark:[--tm-4-ink:#1c1917]",
].join(" ");

/** The scale step (0-4) of a count against the largest count on screen, or null for 0. */
export function countStep(count: number, max: number): number | null {
  if (count <= 0 || max <= 0) return null;
  return Math.min(4, Math.floor((Math.sqrt(count) / Math.sqrt(max)) * 4.999));
}

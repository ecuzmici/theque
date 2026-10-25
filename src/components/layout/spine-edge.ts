import { sampleEvenly } from "@/components/library/LibrarySpineBand";

/** Header bar height (h-14). */
export const HEADER_HEIGHT = 56;
/** Height of the spine edge along the bottom of the header. */
export const SPINE_EDGE_HEIGHT = 5;
/** Target width of one spine. */
const SPINE_PX = 4;
/** Below this many colors, spines look broken; the edge stays a plain keyline. */
const MIN_SPINES = 8;
/** Upper limit, so a wide screen does not get thousands of color stops. */
const MAX_SPINES = 400;

/**
 * A hard-stop gradient with one spine per color across `width` px. Returns
 * null when the library has too few colors or the width is not known yet.
 */
export function spineEdgeGradient(colors: string[], width: number): string | null {
  if (width <= 0 || colors.length < MIN_SPINES) return null;
  const count = Math.min(MAX_SPINES, Math.max(MIN_SPINES, Math.round(width / SPINE_PX)));
  const spines = sampleEvenly(colors, count);
  const step = 100 / spines.length;
  const stops = spines.map(
    (color, i) => `${color} ${(i * step).toFixed(3)}% ${((i + 1) * step).toFixed(3)}%`,
  );
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

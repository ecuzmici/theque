/** Header bar height (h-14). */
export const HEADER_HEIGHT = 56;
/** How far the notch tab hangs below the bar. */
export const NOTCH_DROP = 12;
/** Spine stroke width. */
export const SPINE_STROKE = 7;
/** Target length of one spine along the outline. */
export const SPINE_PX = 4;
/** Space between the wordmark and the notch sides, both sides together. */
export const NOTCH_PADDING = 44;

const CORNER_RADIUS = 16;
const FLARE = 8;

export type NotchGeometry = {
  /** The outline: left side, bottom and right side of the tab. Never the top. */
  stroke: string;
  /** The header surface: the full-width bar plus the tab. */
  fill: string;
  /** Total height including the tab. */
  height: number;
};

/**
 * Geometry for a MacBook-style notch: a tab centered in a `width`-wide header
 * that hangs `NOTCH_DROP` px below the bar. The top corners flare out into the
 * bar; the bottom corners are rounded.
 */
export function notchGeometry(width: number, tabWidth: number): NotchGeometry {
  const half = SPINE_STROKE / 2;
  const cx = width / 2;
  const x1 = Math.round(cx - tabWidth / 2);
  const x2 = Math.round(cx + tabWidth / 2);
  const height = HEADER_HEIGHT + NOTCH_DROP;
  const r = CORNER_RADIUS;
  const f = FLARE;
  const b = height - half;

  const stroke = [
    `M ${x1 - f} 0`,
    `Q ${x1} 0 ${x1} ${f}`,
    `L ${x1} ${b - r}`,
    `A ${r} ${r} 0 0 0 ${x1 + r} ${b}`,
    `L ${x2 - r} ${b}`,
    `A ${r} ${r} 0 0 0 ${x2} ${b - r}`,
    `L ${x2} ${f}`,
    `Q ${x2} 0 ${x2 + f} 0`,
  ].join(" ");

  // Both subpaths wind the same way, so the nonzero clip rule joins them.
  const fill = `M 0 0 L 0 ${HEADER_HEIGHT} L ${width} ${HEADER_HEIGHT} L ${width} 0 Z ${stroke} Z`;
  return { stroke, fill, height };
}

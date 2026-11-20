/** Hue (0-360), saturation and lightness (0-1) of a #rrggbb color, or null. */
export function hexToHsl(hex: string | null): { h: number; s: number; l: number } | null {
  const m = hex?.trim().match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x!, 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/** Sort key that walks the color wheel and puts greys last. */
export function hueSortKey(hex: string | null): number {
  const hsl = hexToHsl(hex);
  if (!hsl) return 1000;
  if (hsl.s < 0.12) return 400 + hsl.l * 100;
  return hsl.h;
}

/** Small deterministic hash, for stable per-item variation. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

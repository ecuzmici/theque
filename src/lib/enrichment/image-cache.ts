import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

function extFromContentType(contentType: string | null): string {
  if (!contentType) return "jpg";
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return EXT_BY_MIME[mime] ?? "jpg";
}

export type CachedImage = {
  storagePath: string | null;
  /** Dominant cover color as #rrggbb, when extraction succeeds. */
  dominantColor: string | null;
  /** Hue 0-359 of the dominant color, for palette sorting. */
  dominantHue: number | null;
};

function hueFromRgb(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return Math.round(((h * 60) % 360 + 360) % 360);
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
    .join("")}`;
}

const HUE_BUCKETS = 36;

/**
 * Picks the most prominent *vivid* color from raw RGB(A) pixels. Near-black,
 * near-white and washed-out pixels are dropped (so dark backgrounds and black
 * borders don't win), the rest are bucketed by hue and weighted by saturation
 * (favoring mid lightness), and the heaviest bucket's weighted-average color
 * wins. Returns null when nothing colorful remains (e.g. a grayscale cover) so
 * the caller can fall back.
 */
function pickVividColor(
  data: Uint8Array | Buffer,
  channels: number,
): { color: string; hue: number } | null {
  const weight = new Array(HUE_BUCKETS).fill(0);
  const accR = new Array(HUE_BUCKETS).fill(0);
  const accG = new Array(HUE_BUCKETS).fill(0);
  const accB = new Array(HUE_BUCKETS).fill(0);
  let total = 0;

  for (let i = 0; i + 2 < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    if (l < 0.12 || l > 0.92) continue; // near-black / near-white
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (s < 0.18) continue; // washed-out
    const w = s * Math.max(0.15, 1 - Math.abs(l - 0.5) * 1.1); // favor saturated mid-tones
    const k = Math.min(HUE_BUCKETS - 1, Math.floor(hueFromRgb(r, g, b) / (360 / HUE_BUCKETS)));
    weight[k] += w;
    accR[k] += r * w;
    accG[k] += g * w;
    accB[k] += b * w;
    total += w;
  }

  if (total <= 0) return null;
  let best = 0;
  for (let k = 1; k < HUE_BUCKETS; k += 1) {
    if (weight[k] > weight[best]) best = k;
  }
  const w = weight[best];
  const r = accR[best] / w;
  const g = accG[best] / w;
  const b = accB[best] / w;
  return { color: toHex(r, g, b), hue: hueFromRgb(Math.round(r), Math.round(g), Math.round(b)) };
}

/**
 * Best-effort dominant cover color; never throws. Prefers a vivid, representative
 * color so dark backgrounds don't flood the palette, falling back to sharp's
 * most-common histogram bin only for genuinely dull/grayscale covers.
 */
async function extractDominantColor(
  buffer: Uint8Array,
): Promise<{ color: string; hue: number } | null> {
  try {
    const { default: sharp } = await import("sharp");
    const { data, info } = await sharp(buffer)
      .resize(64, 64, { fit: "inside", withoutEnlargement: false })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const vivid = (info.channels ?? 3) >= 3 ? pickVividColor(data, info.channels) : null;
    if (vivid) return vivid;

    // Dull/grayscale cover: fall back to the most-common color bin.
    const { dominant } = await sharp(buffer).stats();
    if (!dominant) return null;
    return {
      color: toHex(dominant.r, dominant.g, dominant.b),
      hue: hueFromRgb(dominant.r, dominant.g, dominant.b),
    };
  } catch (err) {
    // This failure is otherwise invisible: callers treat a null color as
    // "best effort, skip" rather than an error worth surfacing.
    console.error(
      "[image-cache] dominant color extraction failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

const NO_IMAGE: CachedImage = { storagePath: null, dominantColor: null, dominantHue: null };

async function fetchValidatedImageBuffer(
  imageUrl: string,
): Promise<{ buffer: Uint8Array; contentType: string } | null> {
  const url = new URL(imageUrl);
  await assertSafeFetchUrl(url);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    redirect: "follow",
    headers: { Accept: "image/*" },
  });

  if (!res.ok) return null;

  const contentType = res.headers.get("content-type");
  if (!contentType?.startsWith("image/")) return null;

  const contentLength = res.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_IMAGE_BYTES) return null;

  const buffer = await (async () => {
    if (!res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_IMAGE_BYTES) return null;
      chunks.push(value);
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  })();

  if (!buffer) return null;

  return { buffer, contentType: contentType.split(";")[0].trim() };
}

export async function cacheItemImage(
  admin: SupabaseClient,
  userId: string,
  itemId: string,
  imageUrl: string,
): Promise<CachedImage> {
  try {
    const fetched = await fetchValidatedImageBuffer(imageUrl);
    if (!fetched) return NO_IMAGE;
    const { buffer, contentType } = fetched;

    const ext = extFromContentType(contentType);
    const storagePath = `${userId}/${itemId}/cover.${ext}`;

    const { error } = await admin.storage
      .from("item-images")
      .upload(storagePath, buffer, { contentType, upsert: true });

    const dominant = await extractDominantColor(buffer);
    return {
      storagePath: error ? null : storagePath,
      dominantColor: dominant?.color ?? null,
      dominantHue: dominant?.hue ?? null,
    };
  } catch {
    return NO_IMAGE;
  }
}

/**
 * Re-extract dominant color for an item whose image is already cached in
 * storage. Skips the upload — only re-fetches the source image and runs
 * extraction, so a null color (e.g. a past sharp failure) can be retried on
 * a later enrichment pass without re-caching.
 */
export async function extractDominantColorForUrl(imageUrl: string): Promise<CachedImage> {
  try {
    const fetched = await fetchValidatedImageBuffer(imageUrl);
    if (!fetched) return NO_IMAGE;
    const dominant = await extractDominantColor(fetched.buffer);
    return { storagePath: null, dominantColor: dominant?.color ?? null, dominantHue: dominant?.hue ?? null };
  } catch {
    return NO_IMAGE;
  }
}

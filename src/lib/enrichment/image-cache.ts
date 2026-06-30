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

/** Best-effort dominant color via sharp's histogram; never throws. */
async function extractDominantColor(
  buffer: Uint8Array,
): Promise<{ color: string; hue: number } | null> {
  try {
    const { default: sharp } = await import("sharp");
    const { dominant } = await sharp(buffer).stats();
    if (!dominant) return null;
    const hex = `#${[dominant.r, dominant.g, dominant.b]
      .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0"))
      .join("")}`;
    return { color: hex, hue: hueFromRgb(dominant.r, dominant.g, dominant.b) };
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

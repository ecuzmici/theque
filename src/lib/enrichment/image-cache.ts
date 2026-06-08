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

export async function cacheItemImage(
  admin: SupabaseClient,
  userId: string,
  itemId: string,
  imageUrl: string,
): Promise<string | null> {
  try {
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

    const ext = extFromContentType(contentType);
    const storagePath = `${userId}/${itemId}/cover.${ext}`;

    const { error } = await admin.storage
      .from("item-images")
      .upload(storagePath, buffer, {
        contentType: contentType.split(";")[0].trim(),
        upsert: true,
      });

    if (error) return null;
    return storagePath;
  } catch {
    return null;
  }
}

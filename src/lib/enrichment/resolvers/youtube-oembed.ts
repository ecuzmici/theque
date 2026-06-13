import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";

const OEMBED_BASE = "https://www.youtube.com/oembed";
const TIMEOUT_MS = 8000;

function isYouTube(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  } catch {
    return false;
  }
}

/** Videos resolver — YouTube oEmbed (no key). Title, channel, thumbnail. */
export const resolveVideo: CategoryResolver = async (input) => {
  if (!isYouTube(input.canonicalUrl)) return null;

  const url = new URL(OEMBED_BASE);
  url.searchParams.set("url", input.canonicalUrl);
  url.searchParams.set("format", "json");

  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  let body: { title?: unknown; author_name?: unknown; thumbnail_url?: unknown };
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    body = (await res.json()) as typeof body;
  } catch {
    return null;
  }

  const patch: ResolverPatch = { source: "youtube_oembed" };
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.author_name === "string" && body.author_name.trim()) {
    patch.structured = { channel: body.author_name.trim() };
  }
  if (typeof body.thumbnail_url === "string" && body.thumbnail_url) patch.image_url = body.thumbnail_url;

  if (!patch.title && !patch.image_url && !patch.structured) return null;
  return patch;
};

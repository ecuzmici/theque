import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";

const SEARCH_BASE = "https://itunes.apple.com/search";
const TIMEOUT_MS = 8000;

type ItunesResult = {
  artistName?: unknown;
  collectionName?: unknown;
  primaryGenreName?: unknown;
  releaseDate?: unknown;
  artworkUrl100?: unknown;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Music resolver — iTunes Search API (no key). Looks up albums by title. */
export const resolveMusic: CategoryResolver = async (input) => {
  const title = input.title?.trim();
  if (!title) return null;

  const url = new URL(SEARCH_BASE);
  url.searchParams.set("term", title);
  url.searchParams.set("entity", "album");
  url.searchParams.set("limit", "1");

  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  let result: ItunesResult | undefined;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: ItunesResult[] };
    result = body.results?.[0];
  } catch {
    return null;
  }
  if (!result) return null;

  const structured: Record<string, unknown> = {};
  const artist = str(result.artistName);
  if (artist) structured.artist = artist;
  const album = str(result.collectionName);
  if (album) structured.album = album;
  const genre = str(result.primaryGenreName);
  if (genre) structured.genre = genre;
  const date = str(result.releaseDate);
  if (date) {
    const y = Number.parseInt(date.slice(0, 4), 10);
    if (y >= 1000 && y <= 3000) structured.release_year = y;
  }

  if (Object.keys(structured).length === 0) return null;

  const patch: ResolverPatch = { source: "itunes", structured };
  const art = str(result.artworkUrl100);
  if (art) patch.image_url = art.replace("100x100", "600x600");
  return patch;
};

export type ImdbSuggestionResult = {
  title_hint: string;
  year?: number;
  genres?: string[];
  media_type?: "movie" | "tv";
  image_url?: string;
};

type SuggestionEntry = {
  id?: string;
  l?: string;
  y?: number;
  s?: string;
  qid?: string;
  i?: { imageUrl?: string };
};

export async function fetchImdbFromSuggestionApi(ttId: string): Promise<ImdbSuggestionResult | null> {
  const res = await fetch(`https://v2.sg.media-imdb.com/suggestion/t/${ttId}.json`, {
    signal: AbortSignal.timeout(6000),
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; theque/1.0; +https://theque.vercel.app)",
    },
  });
  if (!res.ok) return null;

  const body = (await res.json()) as { d?: SuggestionEntry[] };
  const entry = body.d?.find((row) => row.id === ttId) ?? body.d?.[0];
  if (!entry?.l) return null;

  // `entry.s` lists top-billed cast, not crew, so it never fills `directors`.
  // TMDB owns directors (ADR 0011); the resolver runs when they are missing.
  return {
    title_hint: entry.l,
    year: typeof entry.y === "number" ? entry.y : undefined,
    genres: undefined,
    media_type: entry.qid === "tvSeries" || entry.qid === "tvEpisode" ? "tv" : "movie",
    image_url: entry.i?.imageUrl,
  };
}

/** Undefined values are left out, so they never erase a value the page gave. */
export function imdbSuggestionToStructured(data: ImdbSuggestionResult): Record<string, unknown> {
  const out: Record<string, unknown> = {
    site_name: "IMDb",
    original_type: data.media_type === "tv" ? "TVSeries" : "Movie",
    title_hint: data.title_hint,
    year: data.year,
    genres: data.genres,
    media_type: data.media_type ?? "movie",
  };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

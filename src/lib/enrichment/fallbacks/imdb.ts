export type ImdbSuggestionResult = {
  title_hint: string;
  year?: number;
  directors?: string[];
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

  const cast = entry.s
    ?.split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  const directors = cast?.length ? [cast[0]] : undefined;

  return {
    title_hint: entry.l,
    year: typeof entry.y === "number" ? entry.y : undefined,
    directors,
    genres: undefined,
    media_type: entry.qid === "tvSeries" || entry.qid === "tvEpisode" ? "tv" : "movie",
    image_url: entry.i?.imageUrl,
  };
}

export function imdbSuggestionToStructured(data: ImdbSuggestionResult): Record<string, unknown> {
  return {
    site_name: "IMDb",
    original_type: data.media_type === "tv" ? "TVSeries" : "Movie",
    title_hint: data.title_hint,
    year: data.year,
    directors: data.directors,
    genres: data.genres,
    media_type: data.media_type ?? "movie",
  };
}

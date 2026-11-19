import "server-only";

/**
 * TMDB helpers for the idea lab. Free API, key in TMDB_API_KEY. Responses are
 * cached for a day, so a reload does not repeat the calls.
 */
const BASE = "https://api.themoviedb.org/3";
const DAY = 86_400;

export const LAB_REGIONS = ["NL", "GB", "US", "DE", "BE", "ES", "FR", "IE", "RO"] as const;

export type TmdbRef = { type: "movie" | "tv"; id: number };

export type RegionProviders = { stream: string[]; rent: string[]; link: string | null };

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, { next: { revalidate: DAY }, signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** TMDB id from a themoviedb.org URL, or from an IMDb URL through /find. */
export async function tmdbRefForUrl(url: string): Promise<TmdbRef | null> {
  const direct = url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
  if (direct) return { type: direct[1] as "movie" | "tv", id: Number(direct[2]) };
  const imdb = url.match(/imdb\.com\/title\/(tt\d+)/);
  if (!imdb) return null;
  const found = await tmdb<{ movie_results?: Array<{ id: number }>; tv_results?: Array<{ id: number }> }>(
    `/find/${imdb[1]}`,
    { external_source: "imdb_id" },
  );
  if (found?.movie_results?.[0]) return { type: "movie", id: found.movie_results[0].id };
  if (found?.tv_results?.[0]) return { type: "tv", id: found.tv_results[0].id };
  return null;
}

type ProviderEntry = { provider_name?: string; display_priority?: number };
type RegionPayload = { link?: string; flatrate?: ProviderEntry[]; rent?: ProviderEntry[]; free?: ProviderEntry[]; ads?: ProviderEntry[] };

function names(list: ProviderEntry[] | undefined): string[] {
  return (list ?? [])
    .slice()
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .map((p) => p.provider_name)
    .filter((n): n is string => !!n);
}

/** Streaming and rental services per region, from TMDB's JustWatch data. */
export async function watchProviders(ref: TmdbRef): Promise<Record<string, RegionProviders>> {
  const body = await tmdb<{ results?: Record<string, RegionPayload> }>(`/${ref.type}/${ref.id}/watch/providers`);
  const out: Record<string, RegionProviders> = {};
  for (const region of LAB_REGIONS) {
    const entry = body?.results?.[region];
    if (!entry) continue;
    out[region] = {
      stream: [...new Set([...names(entry.flatrate), ...names(entry.free), ...names(entry.ads)])],
      rent: names(entry.rent),
      link: entry.link ?? null,
    };
  }
  return out;
}

export type PersonCredit = { id: number; title: string; date: string | null; poster: string | null; job: string };

/** A director's films and shows, newest first, from TMDB person credits. */
export async function directorCredits(name: string): Promise<{ person: string; credits: PersonCredit[] } | null> {
  const search = await tmdb<{ results?: Array<{ id: number; name: string; known_for_department?: string }> }>(
    "/search/person",
    { query: name },
  );
  const person = search?.results?.find((p) => p.known_for_department === "Directing") ?? search?.results?.[0];
  if (!person) return null;
  const credits = await tmdb<{
    crew?: Array<{ id: number; title?: string; name?: string; job?: string; release_date?: string; first_air_date?: string; poster_path?: string | null }>;
  }>(`/person/${person.id}/combined_credits`);
  const seen = new Set<number>();
  const list: PersonCredit[] = [];
  for (const c of credits?.crew ?? []) {
    if (c.job !== "Director" || seen.has(c.id)) continue;
    seen.add(c.id);
    list.push({
      id: c.id,
      title: c.title ?? c.name ?? "Untitled",
      date: c.release_date || c.first_air_date || null,
      poster: c.poster_path ? `https://image.tmdb.org/t/p/w342${c.poster_path}` : null,
      job: c.job,
    });
  }
  list.sort((a, b) => (b.date ?? "9999").localeCompare(a.date ?? "9999"));
  return { person: person.name, credits: list };
}

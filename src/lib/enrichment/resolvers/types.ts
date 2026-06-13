/**
 * Free category resolvers — deterministic public-API lookups that fill
 * sparse structured fields before any LLM call. Modeled on openlibrary.ts:
 * server-only, SSRF-guarded, fail-open (return null on any miss/error).
 */
export type ResolverInput = {
  canonicalUrl: string;
  title: string | null;
  structured: Record<string, unknown>;
};

export type ResolverPatch = {
  title?: string;
  description?: string;
  image_url?: string;
  structured?: Record<string, unknown>;
  /** Provenance label, e.g. "tmdb", "google_books", "itunes". */
  source: string;
};

export type CategoryResolver = (input: ResolverInput) => Promise<ResolverPatch | null>;

# Enrichment Phase 3 — free category resolver registry — design

**Date:** 2026-06-13
**Status:** Approved design, ready for planning
**Parent spec:** `docs/superpowers/specs/2026-06-13-enrichment-evidence-pipeline-design.md`
**Depends on:** Phase 1 (evidence cascade in `enrich-item.ts`, classify before LLM). Independent of phase 2; can be built in parallel.

## Problem

Deterministic extraction depends on a page exposing OG/JSON-LD. Many category pages don't, or expose sparse data, yet the same item is fully described by a free, structured public API. Phase 1's `openlibrary.ts` already proves the pattern (URL → JSON API → clean `ExtractResult`), but it is hard-wired for one host. We want that determinism — zero hallucination, cacheable, no LLM cost — for more categories.

## Goals

- Fill category-specific structured fields from free public APIs **before** spending an LLM call, raising quality and lowering cost.
- Generalize the proven `openlibrary.ts` shape into a small registry so adding a source is a localized change.
- Keep every resolver fail-open, SSRF-guarded, and deterministic.

## Non-goals

- Paid APIs or anything requiring per-request billing.
- Restaurants/travel (covered by phase 2 grounding; OSM/Nominatim is too spotty to justify here).
- Changing classification order or the LLM merge contract.

## Architecture

New directory `src/lib/enrichment/resolvers/` with a category-keyed registry. Each resolver takes the current evidence (URL, title, existing structured) and returns a partial `ExtractResult`-shaped patch plus a source label, or `null`.

```ts
// src/lib/enrichment/resolvers/types.ts
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
  source: string; // e.g. "tmdb", "google_books"
};

export type CategoryResolver = (input: ResolverInput) => Promise<ResolverPatch | null>;
```

```ts
// src/lib/enrichment/resolvers/index.ts
export const resolversByCategory: Partial<Record<ItemCategory, CategoryResolver[]>>;
export async function resolveCategoryEvidence(
  category: ItemCategory | null,
  input: ResolverInput,
): Promise<ResolverPatch | null>; // runs resolvers in order, returns first non-null
```

### Resolvers (all free / keyless except TMDB)

| Category | Resolver | Source | Notes |
|----------|----------|--------|-------|
| `movies_and_tv` | `tmdb.ts` | TMDB search/multi | **Reuse** `resolveMovieWithTmdb` from `src/lib/recommend/resolve/tmdb.ts` (needs `TMDB_API_KEY`, free). Maps to `year`, `directors` (omit — TMDB multi lacks it), `image_url`, `media_type`. |
| `books` | `google-books.ts` | Google Books API (no key) | Second source when Open Library misses or item isn't an OL work URL; lookup by ISBN (from structured) then by title. Maps to `authors`, `published_year`, `page_count`, `image_url`, `isbn`. |
| `music` | `itunes.ts` | iTunes Search API (no key) | Lookup by title/artist. Maps to `artist`, `album`, `release_year`, `genre`, `image_url`. |
| `videos` | `youtube-oembed.ts` | YouTube oEmbed (no key) | For youtube.com/youtu.be URLs. Maps to `title`, `channel`, `image_url` (thumbnail). |
| `apps` | `github.ts` | GitHub REST API (no key, low rate limit) | For github.com repo URLs. Maps to `developer` (owner), `description`, `image_url` (owner avatar/OG), `category_tag` (primary language). |

Each resolver mirrors `openlibrary.ts` conventions: `"server-only"`, 8 s timeout, `assertSafeFetchUrl`, returns `null` on any miss/error, no throwing.

### Placement in the cascade

In `src/lib/jobs/enrich-item.ts`, **after** extract + classify and **before** the LLM eligibility decision:

```
extract + classify
        │
        ▼
resolveCategoryEvidence(category, { url, title, structured })   ← phase 3
        │  (fail-open; only runs when important fields are still sparse)
        ▼
merge resolver patch as a DETERMINISTIC source
        │
        ▼
decideLlmEligibility  (now sees richer structured ⇒ often skips LLM)
```

**Gating:** only invoke resolvers for a category when its phase-1 "important fields" are still sparse (reuse the `importantFieldsByCategory` helper). A page that already parsed cleanly skips resolvers entirely — no wasted calls.

### Merge precedence

Resolver output is deterministic, so it ranks **above** any LLM output and **below** site-specific parsers/snapshot (which saw the actual page):

```
site parser / snapshot  >  resolver API  >  page-text LLM  >  grounded_search  >  model_knowledge
```

Concretely: a resolver patch fills only fields that are missing/sparse after parsing (same `isMissingOrSparse` rule the LLM merge uses), and the later LLM merge will not overwrite resolver-filled fields. Record `raw_metadata.resolver = { source, fields }` for audit.

## Caching

Resolver results are deterministic for a stable URL, so they are persisted as part of `raw_metadata` on the item and never re-fetched on a normal re-enrich unless the field is still sparse. No separate cache store is introduced (single-user PoC); the per-resolver 8 s timeout and fail-open behavior bound the cost.

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `TMDB_API_KEY` | unset | Enables the movies/TV resolver (already documented for recommendations) |

Google Books, iTunes, YouTube oEmbed, and GitHub need no keys. A resolver whose key is absent returns `null` (already the `resolveMovieWithTmdb` behavior), so the registry degrades gracefully.

## Error handling

- Every resolver fails open (`null` on timeout/non-200/parse error); enrichment proceeds with whatever evidence exists.
- The registry runner catches per-resolver throws defensively and continues to the next resolver.
- GitHub's unauthenticated rate limit (60/hr/IP) is acceptable at single-user volume; a 403/429 simply returns `null`.

## Testing

- **Per resolver:** unit tests against recorded JSON fixtures (success, miss, malformed, timeout) — mirror `src/lib/enrichment/openlibrary.test.ts` and `src/lib/recommend/resolve/open-library.test.ts`.
- **Registry:** `resolveCategoryEvidence` runs resolvers in order, returns the first non-null, skips when category is null or has no resolver, swallows a throwing resolver.
- **Cascade integration:** in `enrich-item`, a sparse movies page gains TMDB fields and consequently skips the LLM (eligibility flips to `deterministic_data_sufficient`); a clean page never calls a resolver.
- **Merge:** resolver-filled fields are not overwritten by a later LLM enhancement.
- **QA matrix:** add rows for a bare YouTube URL, a GitHub repo, an album page (Apple Music/Bandcamp), and a book page that isn't an Open Library work — each expected to gain structured fields without the LLM.

## Security

- All outbound calls SSRF-guarded via `assertSafeFetchUrl` on the constructed API URL.
- API responses are untrusted: validate shapes before mapping (no blind field copy), and run mapped structured fields through the same per-category validators used by the LLM path where practical.

## Rollout

1. Land the registry + resolvers with no behavioral change for clean pages (resolvers only fire on sparse fields).
2. Provide `TMDB_API_KEY` locally; QA movies/TV first (highest impact, key already supported).
3. QA the keyless resolvers (books/music/videos/apps).
4. No production flag needed — resolvers are deterministic and fail-open; absent keys simply no-op.

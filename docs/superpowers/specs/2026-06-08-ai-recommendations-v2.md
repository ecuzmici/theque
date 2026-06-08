# AI Recommendations v2 — Design Spec (grounded)

**Date:** 2026-06-08
**Status:** Draft (supersedes `2026-05-17-ai-recommendations-design.md`)
**Scope:** Books shelf first (F1), Movies/TV second (F2)

## Why a v2

The v1 spec asked Gemini to emit a real `suggested_url` (e.g. `goodreads.com/book/show/52376921`,
`imdb.com/title/tt1856101`). Those URLs are opaque numeric IDs — an LLM cannot reliably produce
them, so the headline action (**Save → capture → enrich**) feeds hallucinated URLs into the
enrichment pipeline and creates broken or wrong items. v1 itself defers "grounded search for
verified URLs" to out-of-scope, leaving its primary CTA unsupported. v1 also inherits a
single-user PoC framing (in-memory rate limiter, prompt-only dedup) that no longer holds for an
open-signup site.

**Core principle:** split the work by what each component is good at.

- **LLM = taste reasoning.** "Given these 20 books, what else would they like, and why." Excellent.
- **Deterministic resolver = grounding.** Turn an identity (title/creator/year) into a *real*
  canonical record, URL, and cover image. The LLM never invents links.

This mirrors the project's existing philosophy (AGENTS.md): deterministic domain map + schema.org
first, gated LLM second. v1 inverted it; v2 restores it.

## Summary

Shelf-scoped recommendations. On the Books (F1) / Watch (F2) shelf, a "Recommend" button opens a
drawer and requests suggestions. Gemini **2.5 Flash** returns *identity-only* candidates; a
deterministic resolver (Open Library for books, TMDB for movies) verifies each candidate, attaches
a real URL + cover, and drops anything it can't verify or that the user already owns. The drawer
shows resolved cards; **Save** routes the *resolved* canonical URL through the existing
`/api/capture` → enrichment pipeline.

## Decisions

| Decision | v1 | v2 | Rationale |
|----------|----|----|-----------|
| URL source | LLM-generated | Deterministic resolver | Kills hallucinated-URL captures |
| Model | Gemini 2.5 Pro | Gemini 2.5 **Flash** | Pro's taste edge is unverifiable; Flash already runs enrichment; ~10× cheaper on a public endpoint |
| Dedup | Prompt instruction | Server-side filter vs. real library | Prompt text isn't enforcement |
| Transport | NDJSON + incremental JSON parser | Single JSON response | Must resolve before showing Save anyway → per-token streaming buys nothing; deletes the bug-prone parser |
| Rate limit | In-memory Map | B1 Redis limiter + B2 quota + 24h cache | Open signup makes containment load-bearing |
| Cover image | LLM `image_url` | Resolver cover (Open Library / TMDB) | Real, hot-link-stable covers; reuses Workstream C cache |
| Shelves | Books + Watch at once | Books first (F1), Watch second (F2) | Open Library needs no key → smallest first slice |

## Architecture & data flow

```
User clicks "Recommend" on Books shelf
        ↓
Client sends shelf items (title, creator, year) — already loaded, capped at 20
        ↓
POST /api/recommend  { shelfId, items[] }
  — auth: session cookie (401 if absent)
  — B1 rate limit + B2 quota (429 / 409)
  — gated by GEMINI_API_KEY (+ TMDB_API_KEY for watch)
        ↓
1. Dedup set: load user's existing normalized titles for this category (1 cheap query)
2. Gemini 2.5 Flash (temp 0.7) → identity-only JSON candidates (request N+buffer, e.g. 8)
3. Resolver (deterministic, parallel, Promise.allSettled):
     books  → Open Library Search API (free, no key)
     movies → TMDB Search API (free key)
4. Filter: drop unresolved candidates; drop dedup collisions (post-LLM, not trusting the prompt)
   Keep first RECOMMEND_COUNT (default 5) resolved+novel cards
        ↓
200 JSON: { cards: ResolvedRecommendation[] }
        ↓
Client renders cards
"Save"   → POST /api/capture { url: card.canonical_url } → normal enrichment pipeline
"Search" → opens google.com/search?q=card.search_query (always available, even pre-resolve fallback)
```

## API contract

### `POST /api/recommend`

**Auth:** session cookie. **Gating:** `isRecommendEnabled()` (mirrors `isLlmEnrichmentEnabled()`).
**Rate limit / quota:** Workstream B1 (`src/lib/rate-limit.ts`) keyed by `userId`, plus a small B2
daily cap. Returns `429` with `Retry-After` / `409 { code: "quota_exceeded" }`.

**Request:**

```ts
type RecommendRequest = {
  shelfId: "books" | "watch";       // watch is F2
  items: RecommendInputItem[];      // max RECOMMEND_MAX_INPUT_ITEMS (20)
};

type RecommendInputItem = {
  title: string;
  creator: string | null;           // author / director, pulled from structured
  year: number | null;
};
```

**Response:** `200 OK`, `application/json` (no streaming).

```ts
type ResolvedRecommendation = {
  id: string;                 // server UUID for React keying
  title: string;
  subtitle: string;           // "Susanna Clarke · 2020"
  description: string;        // 1–2 sentence pitch (from LLM)
  reason: string;             // why, tied to the user's library (from LLM)
  canonical_url: string;      // RESOLVED real URL (Open Library work / TMDB)
  cover_url: string | null;   // RESOLVED cover image
  search_query: string;       // fallback Google query
  source: "open_library" | "tmdb";
};

type RecommendResponse = { cards: ResolvedRecommendation[] };
```

**Errors:** `400` invalid shelfId / empty / >20 items; `401` unauth; `429` rate limit;
`409` quota; `503 { error: "Recommendations not configured" }` when the gate is off (button is
hidden client-side in that case, so this is defense-in-depth). If the LLM call itself fails, return
`502 { error: "Could not generate recommendations" }` — no raw provider error (FINDING-010).

## LLM layer (identity only)

Gemini **2.5 Flash**, `responseMimeType: "application/json"`, `responseJsonSchema` enforcing an
array of candidates with **no URL field**:

```ts
const candidateSchema = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title:       { type: "string" },
          creator:     { type: "string" },          // author / director
          year:        { type: "integer" },
          description: { type: "string" },
          reason:      { type: "string" },
        },
        required: ["title", "creator", "description", "reason"],
      },
      minItems: 5,
      maxItems: 8,                                   // buffer for dedup/resolve drops
    },
  },
  required: ["candidates"],
  additionalProperties: false,
};
```

Prompt (category-aware, books shown):

```
Role: recommendation engine for Theque, a personal taste library.
Task: given the user's saved books, suggest 8 other books they'd likely enjoy.
Look for patterns in genre, tone, era, themes, style.
Rules:
- Never suggest a title already in the user's list (shown below).
- Output identity only: title, creator (author), year, a 1–2 sentence spoiler-free
  description, and one sentence on why it connects to their library.
- Do NOT output URLs or links of any kind.
- Mix well-known and lesser-known titles.
User's books:
{formatted_items}        # - "Piranesi" by Susanna Clarke (2020)
```

We over-request (8) so that post-resolve/dedup drops still leave `RECOMMEND_COUNT` (5) cards.

## Resolver (deterministic grounding)

`src/lib/recommend/resolve/`. Each resolver takes `{ title, creator, year }` and returns
`{ canonical_url, cover_url, confirmed_year } | null`. Run in parallel with `Promise.allSettled`;
a rejection or `null` = unverified → dropped.

### Books — Open Library (F1, no API key)

- `GET https://openlibrary.org/search.json?title={t}&author={a}&limit=5&fields=key,title,author_name,first_publish_year,cover_i`
  (use `limit=5`, not 3 — the right doc isn't always first when title/author formatting differs).
- **Matching (two-pass, tolerant — see prototype finding below):**
  1. **Primary:** normalized title equality AND author overlap. `normalizeTitle()` lowercases,
     strips punctuation/diacritics/leading articles. **Author overlap must split multi-author
     strings** on `/[,&]|\band\b/` and match if *any* candidate token overlaps *any* doc
     `author_name` token (substring either direction). The LLM emits co-author strings like
     `"Arkady and Boris Strugatsky"` while Open Library stores authors separately — a naive
     full-string compare false-drops real books.
  2. **Fallback:** if no doc passes the author check, accept a doc whose **normalized title is an
     exact match** even when the author can't be confirmed (title equality on Open Library is a
     strong enough signal). Prefer the fallback doc with the most metadata (has `cover_i`, closest
     `first_publish_year` to the LLM's `year`).
- `canonical_url = https://openlibrary.org{doc.key}` (e.g. `/works/OL…W`).
- `cover_url = https://covers.openlibrary.org/b/id/{cover_i}-L.jpg` when `cover_i` present.
- Only after *both* passes fail → drop (then it's a likely hallucinated title, not a formatting
  mismatch). The over-request-8-keep-5 buffer absorbs the occasional legitimate drop.
- Fetch through the SSRF guard exported by Workstream B4 (same as everywhere else).

> **Prototype finding (2026-06-08, `scripts/proto-recommend.mjs`):** a real Flash run returned 8
> identity-only picks with **0 URL leakage**; **7/8 grounded** to real URLs + covers. The single
> drop ("Roadside Picnic" by *Arkady and Boris Strugatsky*) was a **resolver false-negative** from
> strict author matching, **not** an LLM hallucination — which is exactly why the two-pass tolerant
> match and the over-request buffer above exist. Note the design fails *safe* (drops a real book)
> rather than *unsafe* (saves a hallucinated URL); the v1 spec would have saved a bad Goodreads ID
> here. Test fixtures should cover this co-author case explicitly.

### Movies/TV — TMDB (F2, free key `TMDB_API_KEY`)

- `GET https://api.themoviedb.org/3/search/multi?query={t}&year={y}` with the key.
- `canonical_url = https://www.themoviedb.org/{media_type}/{id}`; `cover_url` from `poster_path`
  via `https://image.tmdb.org/t/p/w500{poster_path}`.
- Gate the Watch button on `TMDB_API_KEY` presence (independent of `GEMINI_API_KEY`).

## Dedup (`src/lib/recommend/dedup.ts`)

- One scoped query: existing item `title`s for the user in this category.
- `normalizeTitle()` — lowercase, strip punctuation/articles/whitespace.
- After resolve, drop any card whose normalized title (or resolved canonical_url) matches the set.
- Unit-tested with fixtures; this is enforcement, not a prompt hope.

## Save path

`RecommendationCard` "Save" → `POST /api/capture { url: card.canonical_url }`. Because the URL is a
verified Open Library / TMDB page, enrichment fetches a real record and the cover persists via
Workstream C's image cache. No new write path, no direct insert needed. "Search" link
(`google.com/search?q=…`) is always present as a manual fallback.

## UI

Same shape as v1, minus streaming:

- **RecommendButton** — shelf header; visible on books (F1) / watch (F2); enabled at
  `RECOMMEND_MIN_ITEMS` (3); disabled tooltip otherwise; hidden entirely when the gate is off.
- **RecommendDrawer** — right slide-out; header "Recommendations for you" + shelf label;
  skeleton while the single request is in flight; cards on resolve; error state with retry;
  footer disclaimer "AI-generated; verified against Open Library/TMDB but may still be off."
- **RecommendationCard** — cover (resolved, with category-gradient placeholder fallback), title,
  subtitle, description, italic reason; **Save to Library**, **Search**, **Dismiss (×)**.
- **useRecommendations** — single `fetch`, three states: `idle → loading → done | error`. No
  incremental parser.

```ts
type RecommendState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; cards: ResolvedRecommendation[] }
  | { status: "error"; message: string };
```

## Caching & cost control

- **Result cache:** key = `(userId, shelfId, hash(sorted library titles))`, TTL
  `RECOMMEND_CACHE_TTL_SEC` (default 86400). Re-clicking the same unchanged shelf returns the cached
  set and bills nothing. Store in the same Redis used by B1 (or skip when Redis env is unset — dev).
- **Model:** Flash, not Pro.
- **Over-request 8, keep 5:** bounded; no retry loop on under-resolve (just return what survived,
  even if < 5, with the disclaimer).

## Configuration

```env
GEMINI_API_KEY=                              # required; shared with enrichment
TMDB_API_KEY=                                # F2 only; gates the Watch button
GEMINI_RECOMMEND_MODEL=gemini-2.5-flash      # default
GEMINI_RECOMMEND_TEMPERATURE=0.7             # default
GEMINI_RECOMMEND_TIMEOUT_MS=20000            # default
RECOMMEND_MIN_ITEMS=3                         # default
RECOMMEND_MAX_INPUT_ITEMS=20                  # default
RECOMMEND_COUNT=5                             # default (request 8, keep 5)
RECOMMEND_CACHE_TTL_SEC=86400                 # default
RECOMMEND_RATE_LIMIT_PER_DAY=20               # B1/B2 cap per user
```

## File structure

```
src/lib/recommend/
  recommend-types.ts          # candidate + ResolvedRecommendation + request/response
  recommend-prompt.ts         # identity-only prompt + schema           (+ recommend-prompt.test.ts)
  recommend-config.ts         # gate, caps, ttl parsing                 (+ recommend-config.test.ts)
  dedup.ts                    # normalizeTitle + filter                 (+ dedup.test.ts)
  resolve/
    open-library.ts           # books resolver                         (+ open-library.test.ts, fixture)
    tmdb.ts                    # F2 movies resolver                     (+ tmdb.test.ts, fixture)
src/app/api/recommend/
  route.ts                    # auth, validate, ratelimit, orchestrate, JSON out
src/components/recommend/
  RecommendButton.tsx
  RecommendDrawer.tsx
  RecommendationCard.tsx
  useRecommendations.ts
```

Modified: `src/app/(app)/library/page.tsx` (wire button), `.env.local.example`.

## Testing

| Layer | Test |
|-------|------|
| Prompt builder | books formatting, item cap, missing creator/year |
| Config | env parsing, defaults, gate logic (no key → disabled) |
| Open Library resolver | matched fixture → url+cover; **co-author string (e.g. "Arkady and Boris Strugatsky") still matches via token split**; title-only fallback accepts when author unconfirmed; genuine mismatch → null; no-cover → null cover; title-normalize edge cases |
| Dedup | normalization + collision filtering vs. a library fixture |
| API route | auth, shelf validation, rate-limit/quota, gate-off path, LLM-failure → 502 (mocked Gemini + mocked resolver) |
| UI hook | idle → loading → done/error transitions (mock fetch) |

`npm test` green. No E2E for PoC; manual QA via `npm run qa:session-url` with a real Gemini key.

## Phasing

- **F1 — Books.** Flash + Open Library + dedup + B1/B2 + cache, non-streaming. The whole valuable
  feature, no brittleness, no API key beyond the existing `GEMINI_API_KEY`. Ship this.
- **F2 — Movies/TV.** Add TMDB resolver behind `TMDB_API_KEY`; independent gate for the Watch button.
- **F3 — optional.** Per-card streaming (resolve-then-emit via SSE) only if desired after F1.

## Out of scope

- Persistent recommendation history; collection-scoped recommendations.
- Shelves beyond books/watch (eat/travel/cook/read/shop — weaker grounding sources).
- User feedback loop (👍/👎).
- Goodreads/IMDb canonical IDs (Open Library/TMDB are the grounding sources; Goodreads/IMDb remain
  reachable via the user's normal capture if they paste those URLs themselves).
```

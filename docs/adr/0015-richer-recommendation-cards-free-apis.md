---
status: accepted
---

# Richer recommendation cards: free metadata APIs fill the card, the LLM keeps only "Why you"

The AI recommendation deck (Workstream F) ships cards whose *facts* come from a
resolver (Open Library / TMDB search) but whose *prose* comes entirely from the
LLM: the description paragraph is model-written (it can hallucinate plot
details), Watch subtitles show the LLM's unverified `creator` (TMDB multi-search
returns no director — the exact failure mode ADR 0011 documented for
enrichment), and the card answers none of the questions a recommendation
actually raises: *how long is it, who made it, where can I watch it, what is it
really about?*

A survey of free metadata APIs (2026-07-16) found the answers are one cheap
call away:

| Source | Cost | Gain |
|--------|------|------|
| TMDB details + `append_to_response=credits,videos,watch/providers` | 1 call per final card, existing `TMDB_API_KEY` | Official overview, runtime, director/creator, YouTube trailer, per-region streaming providers (JustWatch-sourced, attribution required), season count |
| Google Books volumes search | 1 call per final book card; unkeyed courtesy quota, optional key | Reliable book descriptions (Open Library work descriptions are too sparse) |
| Open Library `first_sentence` search field | zero (same search request) | The book's opening line |
| OMDb (IMDb / Rotten Tomatoes ratings) | free key, 1k/day | **Rejected** — CC BY-NC license; Theque is publicly deployed with open registration, so non-commercial-only data is a license risk for one extra rating number |

## Decisions

- **Real synopsis over LLM description.** When the extras fetch returns a TMDB
  `overview` or Google Books description, it replaces the LLM-written
  description on the card; the LLM text remains only as fallback. The "Why
  you" reason box stays LLM-personalised — that is the part only the LLM can
  write. (Same principle as ADR 0011: an honest sourced fact beats a confident
  fabrication.)
- **Two-phase resolve keeps latency flat.** Extras are fetched in parallel for
  the ~`RECOMMEND_COUNT` *final* cards only — after resolve, dedup, and
  slicing — never for all `RECOMMEND_OVER_REQUEST` candidates. Every extras
  fetch fails open: a miss ships the card without that field.
- **Watch cards** gain runtime ("1h 58m" / "TV · 2 seasons"), verified
  director/creator in the subtitle (replacing the LLM's guess), a "Trailer"
  link (first official YouTube trailer), and streaming providers.
- **Streaming region is geo-detected** from Vercel's `x-vercel-ip-country`
  request header, falling back to `RECOMMEND_WATCH_REGION` (default `US`).
  Only flatrate (subscription) providers are shown. The deck footer carries
  the required "Streaming data from JustWatch" attribution on the Watch shelf.
- **Book cards** gain a Google Books description (title/author sanity-checked,
  HTML-stripped, sentence-truncated; optional `GOOGLE_BOOKS_API_KEY` raises the
  quota) and an "Opening line" quote from Open Library's `first_sentence`
  when present.
- **OMDb stays out** until the license story changes; the card shows one
  rating (Open Library / TMDB), not an aggregator row.
- **Saved items are unaffected.** Saving still captures the canonical URL
  through `/api/capture`; the enrichment pipeline owns item metadata. Card
  extras are response-only and are never persisted.

---
status: accepted
---

# Recommend with structured output, resolve books on Hardcover, keep gemini-3.6-flash first

## Context

The recommendation deck (ADR 0016) asked the AI Gateway for text that contains JSON. `RECOMMEND_RESPONSE_SCHEMA` existed, but no call used it. ADR 0017 added a `schema` option to `generateJsonWithFallback` for structured output.

The books shelf resolved each LLM candidate on Open Library. On 2026-10-09 Open Library answered in about 3 seconds per search. With 24 searches in parallel, many hit the 8-second timeout. Well-known books such as Piranesi failed to resolve, and every model looked worse than it was.

We ran the yield eval (`scripts/eval-recommend.ts`) against the owner's real library with `over_request=24`. A single run is noisy: one round can collapse when the model repeats many titles from the NEVER list. So we compared models over several runs.

## Hardcover replaces Open Library as the first book resolver

The Hardcover free tier allows 60 requests per minute with a burst of 5 for each token. Each top-level GraphQL field counts as one request. A search for each of 24 candidates fails with HTTP 429, and 24 search aliases in one request fail with `request_exceeds_capacity`.

One query on the `books` table works: `books(where: {_or: [{title: {_ilike: ...}}, ...]})`, sorted by `users_count`. It returned all 24 test titles in under 2 seconds. The resolver then picks the best row for each candidate:

1. A title match with an author overlap.
2. Otherwise, the most shelved title match.

Eight well-known books resolved 8/8 in 0.9 seconds. Open Library resolved 5/8 in 5 to 7 seconds.

## Model results (structured output, Hardcover)

| Model | Books: full rounds per run | Books: picks that resolve per round | Watch: full rounds per run |
|---|---|---|---|
| google/gemini-3.6-flash | 8/8, 6/6, 6/6 | 9 to 24 of 24 | 3/5, 5/6, 6/6 |
| openai/gpt-6-luna | 5/8, 5/6, 5/6 | 22 to 24 of 24 | 4/5 |
| anthropic/claude-haiku-5.5 (text mode, Open Library) | 3/6 | 0 to 1 of 24 by round 5 | 4/5 |

- gpt-6-luna resolves almost every pick, but it repeats earlier picks. The books shelf ran out of new titles in all 3 runs.
- gemini-3.6-flash resolves fewer picks, but the picks stay diverse. The books shelf stayed full in all 3 runs.
- On the watch shelf, an A/B test of gemini-3.6-flash with and without the schema gave 11/12 full rounds for each mode. The schema does not cause starvation.
- claude-haiku-5.5 invented titles, for example "Glasshouse" by "Oren Vance".

## Decision

1. Every recommendation call sends `RECOMMEND_RESPONSE_SCHEMA` as structured output. The eval script sends it too.
2. `parseLlmCandidates` parses the response for the route and the eval. It sets `year` to null when the year is not a positive integer. Some models send 0 for an unknown year, and the TMDB resolver would then reject the match.
3. The books shelf resolves candidates with `resolveBooks`: one batched Hardcover request, then Open Library for each candidate that Hardcover did not match. Cards from Hardcover link to `hardcover.app/books/<slug>`. The domain map classifies `hardcover.app` as books.
4. The model order is `google/gemini-3.6-flash`, `openai/gpt-6-luna`, then `google/gemini-3.5-flash-lite`. `RECOMMEND_MODELS` overrides the order.
5. `RECOMMEND_PROVIDER_OPTIONS` turns off reasoning for OpenAI (`reasoningEffort: "none"`) and Google (`thinkingLevel: "minimal"`). `gemini-3.5-flash-lite` rejects `thinkingBudget: 0`.
6. claude-haiku-5.5 is not in the order.

## Consequences

- Book cards resolve faster and more often. Ratings, page counts and genres come from Hardcover.
- Hardcover sets `confirmed_year` to null, because its `release_year` describes an arbitrary edition. The card shows the LLM year.
- The books shelf needs `HARDCOVER_API_KEY`. Without it, the resolver falls back to Open Library for every candidate.
- Starvation is still the limit for heavy use on one shelf in one session. Re-run `npm run eval:recommend` more than once before you change the model order.

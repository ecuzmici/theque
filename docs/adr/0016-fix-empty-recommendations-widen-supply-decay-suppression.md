---
status: accepted
---

# Fix empty recommendations: widen supply, decay suppression, honest exhaustion — validated by a real-pipeline yield eval

The AI recommendation deck (Workstream F) returns **zero cards** for the owner's
Books and Watch shelves, and has for some time. An empty result is *not* an
error — it is the `{ cards: [] }` success path in `src/app/api/recommend/route.ts`.
That means the LLM returned candidates and the downstream funnel filtered every
one of them out.

## Diagnosis

The funnel has three lossy stages after generation, and no observability into
any of them:

1. **Resolve** — TMDB (`resolveMovieWithTmdb`) / Open Library
   (`resolveBookWithOpenLibrary`) must match the candidate.
2. **Dedup** — `dedupRecommendations` drops any normalized title that matches
   the user's **entire** library (`route.ts` fetches all category titles, uncapped).
3. **Never-filter** — `filterNeverTitles` drops anything in the suppression set:
   `dismissed`/`saved` outcomes (permanent) + `shown` outcomes (30-day cooldown)
   + items with empty `structured`.

The structural bug: **the LLM sees at most 20 taste items**
(`RECOMMEND_MAX_INPUT_ITEMS`) but dedup runs against the *whole* library, so for
a heavy user the model is blind to most of what it's being filtered against — it
keeps proposing the obvious taste-adjacent titles the user already owns, which
then get deduped away. Meanwhile only **8 candidates** are ever requested
(`RECOMMEND_OVER_REQUEST`) to survive three lossy stages down to 5. That both
shelves fail simultaneously points at this shared structural cause, not resolver
flakiness.

Real data confirmed the magnitude (owner, prod project `jucaqjkgyhyzixzaisjr`,
2026-07-23):

| Shelf | Library titles | Suppressed by outcomes | LLM asked for |
|-------|----------------|------------------------|---------------|
| Books | 44 | ~57 (41 `shown`·within-30d + 10 `saved` + 6 `dismissed`) | **8** |
| Watch | 43 | ~44 (19 `shown` + 24 `saved` + 1 `dismissed`) | **8** |

For books the model must dodge ~100 distinct titles and land 5 survivors from a
pool of 8 — roughly 12× too little headroom. `shown` dominates and is entirely
fresh (41/41 within the 30-day window): the suppression is self-inflicted by
frequent use, and grows every call.

Two distinct failures are tangled here:

- **Mechanical** (the user's actual complaint): empty *even though fresh options
  obviously exist*. Caused by the LLM-is-blind + only-8-requested design.
- **Structural**: "titles strongly adjacent to 44 books" minus "the ~57 already
  seen/owned" is a finite set. Widening supply delays exhaustion; it cannot
  abolish it. The suppression decay policy determines whether starvation ever
  arrives.

## Decisions

- **Widen supply (mechanical fix).** Over-request **24** candidates (not 8;
  schema `maxItems` and the prompt "return N" both raised), and send the LLM the
  **full** library titles as an explicit "already have — do not suggest" block so
  it stops burning candidates on owned titles. Titles are cheap tokens (~1–2k
  added), well within the p50 ≤ 15s latency gate the model roster was chosen
  under. Resolve stays concurrent (`Promise.allSettled`).

- **Decay the `shown` cooldown (structural, Q4-A).** `shown` = 14 days (was 30);
  "shown but ignored" is not rejection, so ignored titles cycle back and the
  never-list stops growing unbounded. `dismissed` stays permanent (a real no);
  `saved` stays permanent (effectively owned).

- **Honest exhaustion (Q4-C, Q7).** The empty response carries a `reason`
  discriminant derived from funnel counts we now log:
  - LLM returned **≥ `RECOMMEND_COUNT`** candidates but dedup/never wiped them
    all → **`exhausted`**. UI borrows the existing "You're all caught up" voice:
    *"You're near the edge of your taste graph — rate or add more to unlock fresh
    picks."*
  - LLM returned few/zero, or resolve failed → **`transient`**. UI:
    *"Couldn't find picks right now — try again."* (retry affordance).

  The client (`useRecommendationRun` / `RecommendDeck`) branches on the reason
  instead of always showing the misleading "Try again later."

- **Single wide shot now; top-up loop only if earned (Q6).** Ship the 24-wide
  single call + full-library awareness + funnel logging. Do **not** build a
  retry/top-up loop pre-emptively. Run the yield eval below; add a bounded
  single top-up (hard cap 2 LLM calls) only if the eval shows single-shot-24
  under-fills. Keep the pipeline structured so the loop is a small, isolated
  addition either way.

- **Funnel observability.** Log per-stage counts
  (`llm_returned`, `resolved`, `after_dedup`, `after_never`, `final`) in
  `route.ts`. The exhaustion discriminant reuses these; today we are blind to
  where the collapse happens.

- **Eval measures the real failure (Q3-B, Q5).** Evolve `scripts/bench-recommend.ts`
  from a per-call model shootout on a frozen 22-book fixture into a
  **yield/starvation** harness:
  - Feed the **real** library **and** the real outcome/never-list (both shelves,
    not just books).
  - Measure **end-to-end survivors per call** (resolve → dedup → never) and run
    **K sequential rounds**, each round appending its picks to the never-list, to
    find **rounds-until-starvation**.
  - **Import the real pipeline** — `buildRecommendPrompt`,
    `dedupRecommendations`, `filterNeverTitles`, `buildTasteProfile`, and the
    real resolvers — so a green eval proves the production funnel. Only the LLM
    call and the DB fetch are harness-specific. This requires lifting the
    resolvers' pure core out from under `server-only` so prod and eval share one
    implementation (kills the current replica drift, where the bench has its own
    `normKey` / `resolveBook` / `buildPrompt`).
  - Gate: **≥ `RECOMMEND_COUNT` survivors across the early rounds**. Keep the
    blind taste-test for pick quality (manual; no LLM-as-judge for now).

- **Model roster refresh is downstream of the eval, not this ADR.** The eval,
  once it measures yield under a realistic never-list, decides the model list.
  A model that aced the old resolve+novelty bench on a toy fixture can still
  starve in production.

## Validation (2026-07-23)

Built as `scripts/eval-recommend.ts` (`npm run eval:recommend -- --email <addr>`),
which imports the real pipeline under `tsx --conditions=react-server` (that
resolves `server-only` to a no-op, the same trick the backfill scripts use — so
**no resolver refactor was needed**; the Q5 goal of "eval shares real pipeline
code" is met without touching production resolvers). Run against the owner's
real library:

- **Cooldown decay worked as intended.** With 14-day cooldown, `suppressed-now`
  dropped from ~57 → 16 (books) and ~44 → 27 (watch): the 41 stale `shown` book
  titles the 30-day window had locked are released.
- **Books: 3/3 full rounds** (5 survivors each), no under-fill, no starvation.
  Funnel per round ≈ `llm 24 → resolved ~19 → dedup ~15 → never ~10 → final 5`.
- **Watch: 2/3 full rounds**, round 3 honestly reported `exhausted` (final 3),
  driven by the 24 permanent `saved` suppressions. The discriminant fires
  correctly; no full starvation.
- **Single-shot-24 holds → the top-up loop is not built** (Q6 resolved by data).
- **Open finding:** the primary model `google/gemini-3.1-flash-lite`
  (`thinkingBudget: 0`) intermittently returns **truncated JSON at 24 verbose
  candidates** (~7.5k output chars); the fallback chain absorbed it and still
  delivered 5. Options if it recurs: lower `RECOMMEND_OVER_REQUEST` to ~16–18,
  trim the description in the prompt, or re-order the roster — a follow-up
  tuning call, not a blocker.

## Consequences

- Empty-because-narrow-supply should disappear for any user with a non-trivial
  library; true exhaustion becomes rare and, when it happens, is stated honestly
  instead of shown as a dead "try again later."
- Slightly larger prompt and more resolve calls per request; within the existing
  latency gate.
- One-time refactor to make resolvers import-clean, which also removes the
  bench's silent divergence from prod.

## Deferred

- **"Reach further" explore mode** — an opt-in/auto-triggered mode that
  deliberately broadens beyond core taste when yield is low. A distinct feature
  (own prompt mode, own UX, inverted eval axis). Captured in
  `docs/possible-features.md` (2026-07-23).
- **Bounded top-up loop** — built only if the yield eval shows single-shot-24
  under-fills.

---
status: accepted
---

# Recommendations are driven by verdicts, with a persisted outcome log

The recommender previously fed the LLM only the **backlog** (unconsumed `want`
items), parsed lossily from card subtitles on the client, and remembered nothing
between runs — so it ignored the user's strongest taste signal (their ratings and
verdict notes) and could re-suggest the same titles forever. We are rebuilding it
around the verdict loop: the **server** assembles a **taste profile** from the
user's rated items, feeds it as *signed* signal, **persists every
recommendation's outcome**, and presents picks in a focused review **deck**.

## Decisions

- **Verdict-spine, budget blend.** A fixed prompt budget (~20 items) is filled
  verdicted-items-first (highest rating first), then topped up with backlog
  items. 0 verdicts → all-backlog (old behaviour); many verdicts → all-taste. No
  brittle threshold.
- **Signed signal.** 4–5★ items go in as "more like these"; 1–2★ items fill ≤3
  reserved "avoid things that resemble these" slots; 3★ is neutral and excluded
  from both buckets.
- **Verdict notes included.** The one-line verdict note is sent with its item
  when present (truncated ~200 chars) — it carries taste nuance a star can't
  (e.g. "too slow, I gave up", "too fantasy for me").
- **Server-assembled input.** The client only names the shelf; the server builds
  the prompt from the DB (real `structured` fields, ratings, notes, exclusions).
  Items with empty/failed `structured` are dropped from the taste profile but
  their title is kept in the exclusion list.
- **Persisted outcome log.** Every recommended title is stored with an outcome:
  `shown`, `saved`, or `dismissed`. Keyed on `{category, external_id}` from the
  resolver (TMDB / Open Library), normalized title as fallback.
- **Outcome-specific suppression.** Dismissed → permanent exclude. Saved →
  excluded by the existing library dedup. Shown-but-not-acted → 30-day cooldown,
  then eligible again. Recently-excluded titles are also passed into the prompt
  ("never suggest these") to keep the deck full instead of filtering after.
- **Reason-on-dismiss.** Dismissing a pick asks a quick reason (*Not my thing* /
  *Already seen it* / *Not right now*). The exact title is excluded regardless;
  only *Not my thing* becomes a negative *similarity* signal — a bare dismissal is
  too ambiguous to teach "avoid this kind".
- **Surface: focused review deck.** One rec at a time with full info in view
  (cover, source rating, length, genre, full synopsis, a "why you" line),
  mobile-first, with card-swap + chip animations. Chosen over an expandable
  drawer or a gallery+detail page via a throwaway `?variant=` prototype.
- **Live generation, no cache.** A session is "consume the whole deck, return
  later for a fresh one", so a cache is almost always cold or exhausted. We
  generate live each open and make the wait a trust-builder (status lines that
  expose the personalization).
- **Model chosen by a repeatable hybrid benchmark.** Auto-metrics (resolve-rate,
  novelty, diversity, latency; cost recorded as tiebreak only) gate a roster, then
  a blind taste-test among survivors decides. Latency is the hard gate (~8s
  target, ~15s cap), reasoning disabled where the provider allows.
- **Over-request 8 candidates** to survive resolve/dedup drops to ~5 shown.

## Considered and rejected

- **Client-sent items** — structurally cannot carry verdicts, notes, or the
  exclusion log; also lossy (subtitle string parsing) and spoofable.
- **Title-only identity for the log** — collides remakes/editions (Dune 1984 vs
  2021) and both over-suppresses and leaks duplicates.
- **Cache-first generation** — buys nothing when each session exhausts the deck.
- **Positive-only signal / stars-only** — throws away half of every verdict; the
  "avoid" signal and the notes are the cheapest, most differentiating data.
- **Hard threshold switch** between backlog- and verdict-mode — brittle snap at
  the boundary; the budget blend covers the whole spectrum smoothly.

## Consequences

- **New table** for the outcome log (per-user, RLS-scoped) — the first thing the
  feature persists.
- **Cost is a non-constraint** at this volume: even a flagship model is ~€1/mo at
  realistic usage and ~€16/mo at the absurd rate-limit cap; the cheap tier is
  cents. Choose on taste + latency, not price.
- **`AGENTS.md` / `CONTEXT.md` "single user"** means *private, isolated profiles,
  no social features* — not literally one account. The DB already has multiple
  profiles with real data, and the recommend route correctly scopes by
  `user.id`.

## Benchmark verdict (2026-06-28)

Harness: `scripts/bench-recommend.ts` — 9 models × 2 trials on a frozen 22-book fixture
(2 loved with verdict notes, 1 disliked, 18 backlog). Prompt: ADR 0002 redesign
(LOVED/DISLIKED/BACKLOG/NEVER sections). Resolver: Open Library (no API key).
Full results in `/tmp/bench-recommend/results-2026-06-28-2024.json`.

**Note:** OpenAI and XAI models were absent from the Gateway catalog on this date;
`openai/gpt-5-nano` (former primary) was not benchmarkable and had been silently
failing through to the fallbacks in production.

| Model | Resolve | p50 Lat | Gate | Notes |
|---|---|---|---|---|
| `google/gemini-3.1-flash-lite` | 73% | **2.7s** | PASS | **chosen primary** |
| `google/gemini-2.5-flash-lite` | 88% | 6.0s | PASS | kept as fallback; one trial cold-start failure |
| `anthropic/claude-haiku-4.5` | 69% | 8.8s | PASS | kept as fallback; best pick quality |
| `mistral/mistral-small` | 67% | 7.2s | PASS | NEVER-list violation in one trial |
| `amazon/nova-micro` | 58% | 3.9s | PASS | hallucinated author names |
| `google/gemini-2.5-flash` | 42% | 8.1s | PASS | underperforms flash-lite; dropped |
| `deepseek/deepseek-v4-flash` | 82% | 13.5s | PASS | close to gate; dropped |
| `google/gemini-3-flash` | 100% | 15.3s | **FAIL** | over 15s gate by 0.3s |
| `alibaba/qwen3.5-flash` | — | 25.0s | **FAIL** | gateway timeout |

**Winner: `google/gemini-3.1-flash-lite`** — fastest (2.7s), best era diversity (67-year
span across picks), 73% resolve rate, no compliance violations. `gemini-2.5-flash-lite`
retains the first-fallback slot (highest resolve when stable).
New config: `["google/gemini-3.1-flash-lite", "google/gemini-2.5-flash-lite", "anthropic/claude-haiku-4.5"]`.
Provider options updated: Google `thinkingBudget: 0`; OpenAI `reasoningEffort` entry removed.

## Open questions

- ~~**Consent for sending verdict notes to the LLM.**~~ **Resolved 2026-07-25**
  — see below.

## Consent resolution (2026-07-25)

The open question came due when the weekly letter gained a recommendation card:
the interactive deck is *user-initiated* (someone presses "Get my picks" and
their own notes go out as a direct result), but a cron would have sent every due
profile's titles and verdict notes to the Gateway on a schedule none of them
triggered. Resolved by splitting those two cases rather than treating them alike:

- **Explicit opt-in for the scheduled path.** `profiles.ai_personalization_enabled`
  (`boolean not null default false`, migration
  `20260725170000_profiles_ai_personalization_consent.sql`, client-writable via
  the column-level UPDATE grant). The digest job checks it *before* calling
  `generateRecommendations`, so a non-consenting profile is never read for a
  prompt and no LLM call is made on their behalf — the gate is on the call, not
  on the rendered card. Consent is checked in addition to
  `DIGEST_RECOMMEND_MAX_USERS`, which stays as the cost/fan-out ceiling and now
  defaults to 2 instead of 0.
- **The rest of the letter is unaffected.** Shelf items and one-tap star links
  involve no provider, so declining costs a user nothing but the suggestion.
- **Disclosure for both paths.** `/privacy` now names what leaves (item titles,
  creators, years, the saved-titles "don't suggest" list, and verdict notes),
  where it goes (Vercel AI Gateway for recommendations; Google's Gemini API for
  page enrichment), and what it is for — covering the interactive deck and
  enrichment, which already send on user action, as well as the opt-in letter
  card.
- **Toggle lives in Settings → Email** next to the letter switch, default off,
  no pre-checked state and no "recommended" nudge.

Not covered by the flag, deliberately: the interactive deck and LLM enrichment
remain user-initiated and disclosed rather than gated on it — turning the flag
off must not silently disable a feature the user just asked for by pressing a
button.

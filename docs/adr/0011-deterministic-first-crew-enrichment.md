---
status: accepted
---

# Deterministic-first crew enrichment: TMDB owns movie/TV directors, the LLM stops guessing them

Production telemetry (127 items, `LLM_ENRICHMENT_ENABLED=true` in prod, grounding/Jina
off) showed the AI enrichment is not a rare rescue but the **primary** path: the LLM
was eligible on **100/127 items (79%)**, enhanced 90, hard-failed 10. The fields it
fills are overwhelmingly books/movies facts — `published_year`, `genres`,
`runtime_minutes`, `page_count`, `directors`, `authors` — i.e. exactly what the free
deterministic resolvers (TMDB, Google Books) exist to supply. **27% of all filled
fields (101) came from `model_knowledge`** (the model's training memory) rather than
page evidence.

The accuracy failure that triggered this ADR: **every `directors` value sourced from
`model_knowledge` in the library is wrong** — the model returns a prominent *cast
member*, not the director (The Abyss → "Ed Harris" not James Cameron; Manchester by
the Sea → "Casey Affleck" not Kenneth Lonergan; Succession → "Nicholas Braun";
Timecrimes → "Karra Elejalde"; 10/10 in the sample). Books model-recall, by contrast,
spot-checks as accurate (popular titles the model knows) — so this is specifically a
**crew** problem, not a general "memory is bad" problem.

Root cause is structural, not random (`resolvers/tmdb.ts`): TMDB multi-search does
not return a director, so `directors` is **never** filled deterministically; movie
eligibility keys on `["year","directors"]`, so with directors permanently empty,
movies funnel into the LLM, which then "recalls" a director and grabs an actor. Even
the 10 movies where the TMDB resolver *did* fire got their directors from the LLM,
because the resolver maps only `year`/`media_type`/`image` — it also silently drops the
`genres` and `rating` it already fetched.

The governing principle we adopt: **for movie/TV crew, an honest blank beats a
confident fabrication.** You don't sort or filter on director in a taste library; a
wrong one is pure misinformation, an empty one is honest.

## Decisions

- **TMDB is authoritative for movie/TV crew.** Extend the `resolveMovie` enrichment
  resolver to:
  - Map the `genres` and `rating`/`rating_scale` it already fetches in the search call
    (today discarded) — zero extra API calls.
  - Add one `append_to_response=credits` details call on the resolved TMDB id for
    `runtime_minutes` + crew. **Movies** → crew with `job: "Director"`. **TV** →
    `created_by` (showrunner), mapped into the existing `directors` array.
- **TV `created_by` re-uses the `directors` field** rather than a new
  `creators`/`created_by` schema field. It is the meaningful "who made this," feeds the
  existing `buildSubtitle` (`Succession → "Jesse Armstrong · 2018"`), and avoids a
  schema/`StructuredFields`/prompt migration. (See _Considered and rejected_.)
- **The LLM is forbidden from filling crew from memory.** Add `directors` to
  `VOLATILE_STRUCTURED_FIELDS` in `merge-llm-enrichment.ts`, so any `directors` the
  model labels `model_knowledge` is rejected at merge; **page-read** directors still
  pass. When TMDB misses (no match, or a title it doesn't have), the field stays
  **empty**, not wrong.
- **Validator stops throwing away whole payloads.** 4/10 failures were a single stray
  key (`release_year`, `site_name`, `original_type`, `duration_seconds`) tripping
  `unknown_structured_field:*` and rejecting the entire enhancement. Fix both ends:
  set `additionalProperties: false` on the structured JSON schema
  (`buildStructuredJsonSchema`) so Gemini's constrained decoding stops emitting them,
  **and** soften `validateLlmCategoryEnhancement` to **drop** unknown structured fields
  rather than hard-reject. Cross-category benefit.
- **Backfill the already-poisoned data with a surgical TMDB script.** The merge only
  fills *missing* fields (`isMissingOrSparse`), so re-running enrichment will **not**
  overwrite an existing wrong director. A one-shot script searches TMDB by stored
  title+year → fetches credits → **overwrites** `directors`/`runtime_minutes`/`genres`/
  `rating` on existing `movies_and_tv` items. No page re-fetch (sidesteps the
  bot-blocked pages), no LLM (no re-introducing memory, no rate-limit exposure). It
  exercises the same TMDB code path the resolver will use, so it doubles as a live test.
- **Verify by re-measuring.** Re-run the telemetry queries (eligibility rate,
  `model_knowledge` share, the crew spot-check) after the change and the backfill.

## Considered and rejected

- **Let the LLM fill directors as a fallback when TMDB misses** — fewer blanks, but
  knowingly re-admits the actor-for-director failure on exactly the obscure titles
  where the model is least reliable. Rejected: contradicts the honest-blank principle.
- **A dedicated `created_by`/`creators` schema field for TV** — cleaner semantically,
  but a schema migration plus `StructuredFields`, prompt, and subtitle changes for a
  single-user PoC. Folding showrunner into `directors` gets the value with no
  migration.
- **Trust-and-verify the LLM instead (turn on grounding, stronger model)** — a real
  lever for the *sparse long-tail*, but it is the answer to "restaurants/products are
  thin," not "movies are wrong." Determinism fixes the movie case more cheaply and
  permanently.
- **Clear-and-re-enrich through the pipeline** (vs the surgical script) — reuses the
  real path but re-fetches bot-blocked pages and re-invokes the rate-limited LLM for no
  added correctness over a direct TMDB overwrite.
- **Fix the books/Google Books resolver in the same pass** — Google Books fires on
  **0/66 books**, yet books are accurate today (model knows popular titles). It is
  latent risk, not a confirmed bug; folding it in doubles the blast radius. Deferred.

## Consequences

- **Touch-points:** `src/lib/enrichment/resolvers/tmdb.ts` (map genres/rating; add the
  credits call), likely `src/lib/recommend/resolve/tmdb.ts` (expose
  director/runtime/credits on `ResolvedMovie`, or fetch credits in the enrichment
  wrapper), `src/lib/enrichment/llm/merge-llm-enrichment.ts` (`directors` →
  `VOLATILE_STRUCTURED_FIELDS`), `src/lib/enrichment/llm/category-schemas.ts`
  (`additionalProperties: false`; soften unknown-field handling), and the prompt note
  in `prompt-builder.ts` (V3 Tier-2 list should stop inviting crew-from-memory). Tests:
  `resolvers/tmdb.test.ts`, `merge-llm-enrichment.test.ts`, `category-schemas.test.ts`.
- **A throwaway backfill script** under `scripts/` (TMDB key required; runs against
  prod via the service role). Records the before/after director per item so the
  correction is auditable.
- **The principle is half-enforced (known gap).** The guardrail lands on the **automatic
  background path** only. The manual **"Enrich with AI"** button
  (`apply-item-rewrite-proposal.ts`) still **overwrites** structured fields, carries
  **no `field_sources`** provenance, and its prompt explicitly invites crew-from-memory
  (`gemini-item-rewriter.ts`) — so a user-accepted proposal can still write a wrong
  director. It is **human-gated** (reviewed before applying) and low-volume, so it is a
  **documented follow-up**, not part of this change.
- **Deferred follow-ups (recorded, not done):** (1) revive the dead Google Books
  resolver; (2) harden the manual "Enrich with AI" button to the same crew rule
  (needs `field_sources` in the rewrite schema or a resolver pre-pass); (3) Gemini
  free-tier rate-limit / 503 failures (5/10 of all failures) — **partially self-mitigated
  here**, since once TMDB fills `directors`+`year`, movies stop being LLM-eligible, so
  total LLM call volume drops.
- **Reversible:** every change is code-level and reversible; the backfill *overwrites*
  stored crew, so the script must log prior values to be undoable.

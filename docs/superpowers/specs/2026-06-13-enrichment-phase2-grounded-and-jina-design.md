# Enrichment Phase 2 — grounded search + Jina Reader fallback — design

**Date:** 2026-06-13
**Status:** Approved design, ready for planning
**Parent spec:** `docs/superpowers/specs/2026-06-13-enrichment-evidence-pipeline-design.md`
**Depends on:** Phase 1 (`docs/superpowers/plans/2026-06-13-enrichment-evidence-phase1.md`) — direct Gemini SDK enhancer, `pageText` input, `field_sources` provenance (`"grounded_search"` already in `FIELD_SOURCE_VALUES`), evidence cascade in `enrich-item.ts`.

## Problem

After phase 1, two failure modes remain:

1. **Link-only captures of bot-walled pages.** Manual adds, the API, and the iOS Shortcut send no snapshot. When the server fetch hits a WAF/Cloudflare wall or a JS-only shell, there is no page text and no metadata — the LLM (even with tiered world knowledge) cannot help unless the URL alone identifies the entity.
2. **Non-identifiable entities the model can't recall.** Restaurants, travel listings, obscure products, and local venues are rarely Tier-1 identifiable by URL, so phase 1's world-knowledge tier stays silent. These are exactly the items that need a live lookup.

Both are addressable for $0 at single-user volume using two free capabilities: a readability proxy that renders JS (Jina Reader) and Gemini's built-in Google Search grounding.

## Goals

- Give bot-walled, snapshot-less pages a real shot at usable text before declaring `fetch_blocked_or_sparse`.
- Let the LLM "go look it up" for non-identifiable entities (restaurants, travel) instead of returning empty.
- Stay at effectively $0/month; never block the deterministic result; never hallucinate volatile facts.

## Non-goals

- Replacing the deterministic fetch for healthy pages (Jina is a last resort only).
- Grounded search on every item (it is gated to the blocked/sparse, non-identifiable case).
- Paid search APIs, headless browsers, or proxy infrastructure.

## Component 1 — Jina Reader fallback (evidence gathering)

**Where:** evidence cascade in `src/lib/jobs/enrich-item.ts`, after the server fetch and before classification/LLM. New module `src/lib/enrichment/jina-reader.ts`.

**Trigger (all must hold):**
- No Open Library path and no capture snapshot (those are already better evidence).
- The server fetch was bot-blocked (`isBotBlockPage`) **or** produced sparse evidence (`hasSparseFetchEvidence`).
- `JINA_READER_ENABLED === "true"` (env flag, default off — see Privacy).

**Behavior:**
- Fetch `https://r.jina.ai/<absolute url>` with `Accept: text/markdown`, an 8 s timeout, and a response-size cap mirroring `fetchPage` (2 MB). All requests pass `assertSafeFetchUrl` on the constructed proxy URL.
- On success, the returned markdown becomes the `pageText` fed to the LLM (capped via the phase-1 `MAX_PAGE_TEXT_CHARS`). Jina also returns a title line and often an image; when the deterministic title is weak and Jina yields a clear `Title:` header, use it as a `title_hint`-equivalent.
- Record `raw_metadata.evidence_source = "jina_reader"` and keep `raw_metadata.jina = { fetched_at, status }` for audit.
- Fail-open: any Jina error leaves the original blocked/sparse result untouched and enrichment continues exactly as today.

**Interface:**

```ts
// src/lib/enrichment/jina-reader.ts
export type JinaReaderResult = { markdown: string; title: string | null } | null;
export async function fetchViaJinaReader(url: string): Promise<JinaReaderResult>;
```

**Why a flag, default off:** Jina Reader sends the saved URL to a third party. Acceptable for a single-user PoC but opt-in. Documented in `.env.local.example` and AGENTS.md.

## Component 2 — Grounded-search two-step (LLM path)

**Where:** new module `src/lib/enrichment/llm/grounded-enrich.ts`, invoked from `enhanceCategoryWithGemini` (or a sibling the enricher delegates to) when the grounded path is selected.

Grounding and strict `responseJsonSchema` output cannot combine in a single Gemini call, so this is two calls:

1. **Grounded answer (free text).** Call the direct SDK with `tools: [{ googleSearch: {} }]` (no `responseJsonSchema`), temperature 0.1, thinking disabled, prompt: "Identify the specific item at this URL. Report name, type/category, and any of: location/address, cuisine, brand, author/creator, year. Only state facts you find via search; say 'unknown' otherwise." Pass the URL, the weak title, and any snapshot/Jina text available.
2. **Structuring call.** Feed the grounded free-text answer (plus the original URL/title) into the existing phase-1 `enhanceCategoryWithGemini` flow as `pageText`, with a sentinel that marks its provenance. The structured fields it returns are labeled `"grounded_search"` in `field_sources`.

This means step 2 reuses the entire phase-1 schema-enforced path; grounded text simply becomes another `pageText` source. The only new code is step 1 and the wiring that routes a grounded answer into step 2 with the right provenance label.

**Eligibility (in `decideLlmEligibility`, extended):** a new boolean output `groundingRecommended`, true when:
- `LLM_GROUNDING_ENABLED === "true"` (env flag, default off), and
- the fetch was blocked or sparse (`blocked_or_sparse_fetch` / `uncategorized`), and
- the entity is **not** Tier-1 identifiable — approximated as "no canonical ID in the URL". A small `hasCanonicalIdInUrl(url)` helper (IMDb `tt…`, Goodreads `/book/show/<id>`, Open Library work keys, TMDB numeric ids) decides this; when true, phase-1 world knowledge already covers it and grounding is skipped.

**Budget guard:** at most one grounded call per item per enrichment run. Free tier (~1,500 grounded queries/day) dwarfs single-user volume; the flag and the one-call cap are the only controls needed.

**Provenance & merge:** grounded fields flow through the existing junk-aware merge from phase 1. Because `field_sources` already supports `"grounded_search"`, `merge-llm-enrichment.ts` needs no schema change — only the confidence clamp logic should treat a grounded-only result like the model-knowledge cap (≤ 0.7) unless step-1 search citations are present.

## Data flow

```
fetch blocked/sparse, no snapshot
        │
        ├─ JINA_READER_ENABLED ─► r.jina.ai ─► markdown ─► pageText ─┐
        │                                                            ▼
        └─ LLM_GROUNDING_ENABLED & not Tier-1 id ─► googleSearch ─► grounded text ─► pageText (grounded_search)
                                                                     │
                                                                     ▼
                                       enhanceCategoryWithGemini (schema-enforced, phase 1)
                                                                     │
                                                                     ▼
                                       junk-aware merge (field_sources: grounded_search)
```

Jina and grounding are independent and can both contribute: Jina markdown is page evidence (`"page"`), grounding is `"grounded_search"`. When both are available, prefer Jina text as `pageText` and run grounding only if fields are still sparse.

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `JINA_READER_ENABLED` | `false` | Opt-in readability proxy for blocked/sparse, snapshot-less fetches |
| `LLM_GROUNDING_ENABLED` | `false` | Opt-in Google Search grounding two-step |
| `JINA_READER_TIMEOUT_MS` | `8000` | Optional override |

Both flags off ⇒ behavior identical to phase 1.

## Error handling

- Every new outbound call is fail-open: failure reverts to the phase-1 result and records a `status`/`reason` in `raw_metadata` (`jina`, `grounded`).
- Grounding step-1 failure ⇒ skip step-2 grounding, fall through to ordinary phase-1 enrichment.
- Existing retry semantics (`enrichment_attempts` ≤ 3) unchanged.
- SSRF guard applies to the constructed Jina URL.

## Testing

- **Jina:** unit-test `fetchViaJinaReader` with mocked `fetch` (success markdown, non-200, timeout, oversized body); integration via `enrich-item` evidence selection (snapshot present ⇒ Jina skipped; blocked + flag on ⇒ Jina used; flag off ⇒ skipped).
- **Grounding eligibility:** `hasCanonicalIdInUrl` truth table (IMDb/Goodreads/OpenLibrary/TMDB ⇒ true; bare restaurant URL ⇒ false); `decideLlmEligibility` sets `groundingRecommended` only when flag on + blocked/sparse + not identifiable.
- **Grounded two-step:** mock the SDK so call 1 (with `tools`) returns grounded text and call 2 returns schema JSON; assert step-2 `field_sources` are `"grounded_search"` and confidence is clamped without citations.
- **Merge:** grounded-only enhancement clamps recorded confidence ≤ 0.7.
- **Eval:** extend `scripts/eval-gemini-prompt.ts` (or a sibling) with a few blocked-restaurant fixtures to sanity-check grounded output before enabling in production.
- **QA matrix:** add a bot-walled restaurant (Maps/Yelp) link-only row and a JS-only SPA link-only row to `docs/qa-checklist.md`, expected to resolve via grounding/Jina respectively.

## Security & privacy

- Jina Reader leaks the saved URL to a third party — gated behind `JINA_READER_ENABLED`, documented, default off.
- Google Search grounding sends the URL/title to Gemini (already the enrichment provider) — gated behind `LLM_GROUNDING_ENABLED`.
- Grounded output is untrusted text: it flows through the same validator and junk-aware merge as all LLM output; volatile facts remain banned unless backed by search citations.

## Rollout

1. Land with both flags **off**; verify the phase-1 suite is unaffected.
2. Enable `JINA_READER_ENABLED` locally, QA a few known bot-walled link-only URLs.
3. Enable `LLM_GROUNDING_ENABLED` locally, QA restaurants/travel; review `raw_metadata.llm` + `grounded` blobs.
4. Flip flags in production once results look good.

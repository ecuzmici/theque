# Enrichment evidence pipeline — design

**Date:** 2026-06-13
**Status:** Approved design, phase 1 ready for planning

## Problem

Items too often end up with missing details, and Gemini enrichment "almost never
returns useful information". Root cause analysis showed this is an **evidence
problem, not a model problem**:

1. The LLM never sees the page. It only receives metadata the deterministic
   parsers already extracted (OG, Twitter, JSON-LD). On bot-blocked or sparse
   pages that metadata is empty — and the prompt then forbids using anything
   else ("use only the provided evidence, do not invent"). The model has
   nothing to work with and returns an empty shell.
2. The eligibility gate correctly skips the LLM when deterministic extraction
   is rich — so the LLM is only ever invoked in exactly the no-evidence case
   it cannot handle.
3. When classification fails (`category = null`) the LLM is skipped entirely,
   so unknown URLs land in Inbox with nothing.
4. The merge layer only fills gaps; it never replaces junk ("Access Denied"
   titles, WAF page descriptions).
5. The richer v2 prompt and the JSON response schema exist in the repo but are
   not wired into production (`prompt-builder.ts` v2 is eval-only;
   `buildGeminiResponseJsonSchema()` is never passed to the API).
6. Two divergent LLM paths exist: background job via AI Gateway
   (`gemini-category-enhancer.ts`) and the manual "Enrich with AI" button via
   the direct Gemini SDK (`gemini-item-rewriter.ts`).

Both entry points are affected: background enrichment on first capture, and
the manual "Enrich with AI" button on the item detail page.

## Goals

- Sharply increase the share of items that get a good title, description,
  image, and category-specific structured fields — on first capture and on
  manual re-enrichment.
- Make bot-blocked and JS-rendered pages (Amazon, Google Maps, Instagram,
  booking sites) enrichable.
- Keep total cost at effectively $0/month at single-user volume.
- Never hallucinate volatile facts (prices, current ratings, availability,
  addresses).

## Non-goals

- Multi-user scale, rate-limit engineering, or paid API tiers.
- Google Places API integration.
- Changing the shelf/classification taxonomy.
- Headless-browser scraping infrastructure.

## Decisions made during brainstorming

| Decision | Choice |
|----------|--------|
| LLM transport | **Direct Gemini SDK everywhere** (`GEMINI_API_KEY`). AI Gateway is dropped for enrichment (it stays for unrelated features). Grounding, `responseSchema`, and image input are first-class only on the direct SDK. |
| Screenshot capture | **Deferred to phase 4.** Text snapshot covers most value at ~10 KB vs ~100–300 KB per capture. `captureVisibleTab` needs no new permission (activeTab suffices), so adding it later is review-cheap. |
| Scope | Spec covers all phases; **implement phase 1 first**. |

## Architecture: evidence cascade

Enrichment becomes a single evidence pipeline shared by both entry points.
Evidence sources are tried cheapest/most-deterministic first; the LLM is the
last consumer of whatever evidence was gathered, not a fallback fed on scraps.

```
capture (extension | API | manual)
        │
        ▼
[1] capture_snapshot (extension only; rendered DOM)  ──┐
[2] server fetch (existing; skipped if snapshot)       ├─► evidence bundle
[3] category resolvers (TMDB, Google Books, …)         │   (title, meta, JSON-LD,
[4] Jina Reader fallback (blocked + no snapshot)     ──┘    page text, image, …)
        │
        ▼
deterministic extract + classify (existing, extended)
        │
        ▼
eligibility gate (relaxed: runs on category=null too)
        │
        ▼
unified LLM core (direct Gemini SDK)
  • prompt v3: page text + tiered world knowledge + provenance
  • responseSchema enforced at API level
  • grounded-search two-step for blocked/sparse (phase 2)
  • image input when text evidence is thin (phase 4)
        │
        ▼
junk-aware merge (replace weak/junk fields, not just fill gaps)
```

## Component design

### A. Capture snapshot (extension)

**Extension changes** (`extension/`):

- Add `"scripting"` to `manifest.json` permissions. Paired with the existing
  `activeTab`, this shows no new permission warning; it does trigger a normal
  Chrome Web Store version review.
- On Save, the popup calls `chrome.scripting.executeScript` against the active
  tab with a self-contained snapshot function that collects:
  - `document.title` and `link[rel=canonical]` href
  - all `meta[property]` / `meta[name]` tags as `{ key, content }` pairs
  - the text content of every `script[type="application/ld+json"]`
  - a trimmed main-content `innerText` excerpt: prefer `<main>`, `<article>`,
    or the largest text block; strip nav/footer/script noise; cap at
    **8 KB**
- The result is sent as `capture_snapshot` in the existing capture POST.
  Snapshot failure (restricted page, injection error) is non-fatal: capture
  proceeds without it, exactly as today.

**Capture API changes** (`src/app/api/capture`):

- Accept optional `capture_snapshot` object. Validate shape and enforce a
  **64 KB** total serialized cap server-side; oversized or malformed snapshots
  are dropped (capture still succeeds).
- Store under `items.raw_metadata.capture_snapshot` with `captured_at`.
- **Duplicate URL handling:** when the POST matches an existing item
  (`created: false`) and a snapshot is provided, store/replace the snapshot;
  if the item is sparse or failed, reset `processing_status = 'pending'` and
  `enrichment_attempts = 0` so it re-enriches with the new evidence. This is
  the plumbing for the phase-4 "re-capture with page data" UX, and it works
  implicitly from phase 1 (saving an already-saved page upgrades it).

**Enrichment changes** (`src/lib/jobs/enrich-item.ts`, `src/lib/enrichment/`):

- A snapshot adapter converts `capture_snapshot` into the same intermediate
  evidence structure the HTML path produces (OG map, Twitter map, JSON-LD
  array, page text), reusing the JSON-LD field extraction in
  `parsers/jsonld-fields.ts`.
- When a snapshot exists, the **server fetch is skipped**. The snapshot came
  from a rendered, logged-in, bot-check-passed page and is strictly better
  evidence than a server-side fetch of the same URL.
- Site-specific parsers that rely on DOM selectors (Goodreads description)
  degrade gracefully: they get the JSON-LD/meta portion of their inputs.

### B. Page text for the LLM

- New `src/lib/enrichment/page-text.ts`: extract readable main-content text
  from fetched HTML (reuse the existing JSDOM document; drop `script`,
  `style`, `nav`, `header`, `footer`, `aside`; prefer `main`/`article`;
  collapse whitespace). Cap at **4,000 chars**.
- Sources, in preference order: snapshot `innerText` excerpt → stripped
  fetched HTML → Jina Reader markdown (phase 2).
- Included in the LLM prompt as a `Page text:` block.

### C. Unified LLM core (direct Gemini SDK)

Replace `gemini-category-enhancer.ts` (gateway) and converge with
`gemini-item-rewriter.ts` (SDK) on one module, e.g.
`src/lib/enrichment/llm/enrich-with-gemini.ts`:

- **Transport:** `@google/genai` SDK with `GEMINI_API_KEY`. Models:
  `gemini-2.5-flash-lite` primary, `gemini-2.5-flash` fallback, thinking
  disabled, temperature 0.1, timeout 15 s (raised from 10 s to accommodate
  page text).
- **Output:** `buildGeminiResponseJsonSchema()` passed as `responseSchema` /
  `responseMimeType: "application/json"`. Post-hoc validation
  (`validateLlmCategoryEnhancement`) is kept as a second line of defense.
- **Gating:** `LLM_ENRICHMENT_ENABLED=true` + `GEMINI_API_KEY`.
  `AI_GATEWAY_API_KEY` is no longer consulted by enrichment. Update
  `.env.local.example` accordingly.
- **Both entry points** (background job and "Enrich with AI" button) call
  this module. The button keeps its propose-then-accept UX but the proposal
  is generated from the same evidence bundle and prompt; it may additionally
  overwrite populated fields since the user reviews the result.

**Prompt v3** (successor to the unwired v2 in `prompt-builder.ts`):

- Inputs: URL, current title/subtitle/description/image, structured fields,
  OG/Twitter/JSON-LD, **page text**, parser name, and the category schema for
  the (fixed or suggested) category.
- **Tiered world knowledge** replaces the blanket "do not invent" rule:
  - *Tier 1 — identified entity:* if the URL contains a canonical ID
    (`imdb.com/title/tt…`, `goodreads.com/book/show/…`, a Maps place URL) or
    the evidence pins an exact title + creator, the model MAY fill
    widely-known stable facts (author, director, year, genres, page count,
    cuisine type) from its own knowledge. Each such field must be listed in
    `field_sources` as `"model_knowledge"`, and overall confidence for
    knowledge-derived fields is capped at **0.7**.
  - *Tier 2 — volatile/unverifiable facts:* prices, current ratings, ratings
    counts, availability, addresses, phone numbers, opening hours are NEVER
    filled from model knowledge. They come only from page evidence or
    grounded search (phase 2).
  - Error/WAF-page guard and source-labeling rules carried over from the v2
    draft.
- **Schema addition:** optional `field_sources` object mapping structured
  field name → `"page" | "model_knowledge" | "grounded_search"`. Stored in
  `raw_metadata.llm` for audit and consumed by the UI marker (phase 4).

**Grounded-search two-step** (phase 2): when fetch was blocked/sparse AND no
snapshot exists AND the entity is not Tier-1 identifiable (typical for
restaurants, travel, obscure products):

1. Call Gemini with `tools: [{ googleSearch: {} }]` and a free-text prompt
   ("identify this page and report name, type, location, cuisine, …").
   Grounding and strict JSON schema cannot combine in one call.
2. Feed the grounded answer into a second flash-lite call with the normal
   responseSchema to structure it. Fields sourced this way are labeled
   `"grounded_search"`.

Budget guard: at most 1 grounded call per item per enrichment run; free tier
(~1,500/day) is orders of magnitude above single-user volume.

### D. Eligibility and merge fixes

`src/lib/enrichment/llm/eligibility.ts`:

- LLM runs when `category === null` (currently skipped). In that case the
  prompt allows `category_suggestion` from the full category list, directly
  attacking the "Inbox with nothing" failure mode.
- Existing sparse/blocked/weak-title triggers stay.

`src/lib/enrichment/llm/merge-llm-enrichment.ts`:

- New notion of **junk-aware replacement**: a field is replaceable when it is
  missing OR junk — title matching the weak/error-title detection
  (`isWeakTitle`, WAF/error markers), description under 30 chars or matching
  block-page text. Confident LLM output may replace junk; it still never
  replaces good deterministic data.
- Source precedence for structured fields:
  `site parser / snapshot > resolver API > page-text LLM > grounded_search >
  model_knowledge`.
- Resolver results (section E) merge as deterministic sources.

### E. Category resolver registry (phase 3)

Extend the proven `openlibrary.ts` pattern into a small registry,
`src/lib/enrichment/resolvers/`, keyed by category and invoked after
extract/classify when important fields are still sparse:

| Category | Resolver | Key needed |
|----------|----------|-----------|
| `movies_and_tv` | Reuse `resolveMovieWithTmdb` (`src/lib/recommend/resolve/tmdb.ts`) | `TMDB_API_KEY` (free, already supported) |
| `books` | Google Books API (second source when Open Library misses) | none |
| `music` | iTunes Search API | none |
| `videos` | YouTube oEmbed (title, channel, thumbnail) | none |
| `apps` | GitHub API for repo URLs | none |
| `restaurants` | none — grounded search (phase 2) covers it | — |

Each resolver: 8 s timeout, fail-open, results cached in `raw_metadata`,
SSRF-guarded via `assertSafeFetchUrl` where applicable.

### F. Jina Reader fallback (phase 2)

When the server fetch is bot-blocked or near-empty AND no snapshot exists:
fetch `https://r.jina.ai/<url>` (free tier, renders JS, returns markdown),
use the markdown as page text for the LLM. Strictly a last resort before
`enrichment_error = "fetch_blocked_or_sparse"`. Note: this shares the saved
URL with a third party; acceptable for a single-user PoC, documented here.

### G. Backlog loop (phase 4)

- **"Needs details" badge** on `ItemCard`/`ItemDetail`, computed with the same
  important-fields helper `decideLlmEligibility` already uses (extracted to a
  shared function).
- **Re-capture with page data:** the extension popup compares the active tab
  URL against the library (lightweight lookup endpoint or the dedup response
  from a capture POST). When the page matches a sparse saved item, the Save
  button becomes "Update with page data" — which is just the duplicate-URL
  snapshot path from section A.
- **Screenshot evidence:** add `captureVisibleTab` (no new permission) to the
  snapshot, stored via the existing image-cache path; the LLM call passes it
  as image input when text evidence is thin. Book covers, product shots, and
  Maps screenshots carry title/brand/cuisine the text often lacks.
- **Multimodal `og:image`:** even without a screenshot, pass the cover image
  to flash-lite when structured fields are sparse after the text pass.

## Cost analysis

| Item | Cost |
|------|------|
| Capture snapshot, page text, plumbing fixes | $0 (code only) |
| Gemini flash-lite with page text (~5k tokens in, ~500 out) | fractions of a cent per item; free tier covers single-user volume |
| Google Search grounding | free ≤ ~1,500/day |
| Jina Reader | free tier |
| TMDB / Google Books / iTunes / oEmbed / GitHub | free |
| Screenshot input (phase 4) | ~$0.001/item on flash-lite |

## Error handling

- Snapshot collection and validation failures are non-fatal at every step;
  capture and enrichment proceed with whatever evidence exists.
- Every LLM/resolver/Jina failure fails open: the deterministic result is
  saved, `raw_metadata.llm` records `status`/`reason` as today.
- Existing retry semantics unchanged (`enrichment_attempts` max 3, manual
  retry endpoint).

## Testing

- **Unit:** snapshot adapter (snapshot → evidence bundle), page-text
  extraction against existing fixtures + a new SPA-like fixture, prompt v3
  builder snapshots, junk-aware merge cases (junk title replaced, good title
  kept, volatile fields rejected from `model_knowledge`), eligibility with
  `category = null`, each resolver against recorded JSON fixtures.
- **Capture API:** snapshot accepted/capped/dropped; duplicate-URL snapshot
  upgrade resets enrichment.
- **Eval:** extend `scripts/eval-gemini-prompt.ts` to run prompt v3 over the
  existing eval set before enabling in production (matches the rollout note
  in `docs/category-schemas.md`).
- **QA:** extend `docs/qa-checklist.md` matrix with extension-captured Amazon
  / Maps / Instagram rows where today's expected result is "blocked".

## Security notes

- `capture_snapshot` is user-supplied content from arbitrary pages: enforce
  size caps, treat as untrusted text (never render as HTML), and parse
  JSON-LD with the same hardened path as fetched pages.
- The capture token already authenticates the POST; the snapshot adds no new
  auth surface.
- Jina Reader leaks saved URLs to a third party (documented in section F).
- SSRF guard (`assertSafeFetchUrl`) applies to all new outbound calls.

## Phases

| Phase | Contents | Notes |
|-------|----------|-------|
| **1 (next)** | Extension snapshot (+`scripting` permission, store re-review) → capture API → snapshot-preferred enrichment; page-text extraction; unified LLM core on direct SDK with prompt v3 + responseSchema; eligibility (`category=null`) + junk-aware merge; `.env.local.example` update | Fixes both reported pain points at $0 |
| 2 | Grounded-search two-step; Jina Reader fallback | Restaurants/travel/blocked pages |
| 3 | Resolver registry (TMDB reuse, Google Books, iTunes, YouTube oEmbed, GitHub) | Deterministic, cacheable |
| 4 | Screenshot + multimodal image input; "needs details" badge; "Update with page data" UX | Builds on phase-1 plumbing |

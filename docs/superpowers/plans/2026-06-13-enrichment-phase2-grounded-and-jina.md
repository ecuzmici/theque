# Enrichment Phase 2 — Grounded Search + Jina Reader Fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give bot-walled, snapshot-less pages a real shot at usable evidence (Jina Reader markdown) and let the LLM "go look it up" for non-identifiable entities like restaurants and travel (Google Search grounding two-step).

**Architecture:** Two opt-in capabilities. (1) `fetchViaJinaReader` renders JS-heavy/blocked pages via `r.jina.ai` and supplies the markdown as `pageText`. (2) A grounded two-step in the LLM core: a `googleSearch`-tool call produces grounded free text, which is then structured by the existing phase-1 schema-enforced call and labeled `field_sources: "grounded_search"`. Both gated by env flags, default off, fail-open.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, `@google/genai` (grounding tool), `assertSafeFetchUrl`, Jina Reader (`r.jina.ai`).

**Spec:** `docs/superpowers/specs/2026-06-13-enrichment-phase2-grounded-and-jina-design.md`

**Base branch:** branch off the current merged `feat/phase-1-2` (or master containing phase 1).

**Conventions:**
- Commands run from repo root. Shell is PowerShell — chain with `;`, never `&&`.
- `npx vitest run <file>` for one file; `npm test` for the suite.
- Commit after each task. Never commit `.env.local`.
- Both new outbound paths are fail-open and behind a default-off env flag.

**Phase-1 building blocks this plan reuses (already merged):**
- `enhanceCategoryWithGemini(input)` and `GeminiCategoryInput` (with `pageText`, nullable `category`) in `src/lib/enrichment/llm/gemini-category-enhancer.ts`.
- `FIELD_SOURCE_VALUES` already includes `"grounded_search"` (`src/lib/enrichment/llm/category-schemas.ts`) — no schema change needed.
- `decideLlmEligibility` in `src/lib/enrichment/llm/eligibility.ts`.
- Evidence cascade + `pageText` plumbing in `src/lib/jobs/enrich-item.ts`.
- `MAX_PAGE_TEXT_CHARS = 4000` in `src/lib/enrichment/page-text.ts`.

**Parallel-execution note:** Tasks 1–2 and 4 create NEW files (independent of Phase 3). Task 3 edits `eligibility.ts` (Phase 3 does NOT edit it). Task 5 edits `gemini-category-enhancer.ts` (Phase 3 does NOT edit it). Task 6 edits the SHARED `src/lib/jobs/enrich-item.ts`; Task 7 edits shared docs. See "Parallel execution with Phase 3" at the end before running Task 6.

---

### Task 1: `hasCanonicalIdInUrl` identity helper

Decides whether an entity is Tier-1 identifiable (canonical ID in URL). When true, phase-1 world knowledge already covers it, so grounding is skipped.

**Files:**
- Create: `src/lib/enrichment/url-identity.ts`
- Create: `src/lib/enrichment/url-identity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/enrichment/url-identity.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { hasCanonicalIdInUrl } from "@/lib/enrichment/url-identity";

describe("hasCanonicalIdInUrl", () => {
  it("is true for IMDb title IDs", () => {
    expect(hasCanonicalIdInUrl("https://www.imdb.com/title/tt0468569/")).toBe(true);
  });
  it("is true for Goodreads book pages", () => {
    expect(hasCanonicalIdInUrl("https://www.goodreads.com/book/show/119322.The_Lord_of_the_Rings")).toBe(true);
  });
  it("is true for Open Library work keys", () => {
    expect(hasCanonicalIdInUrl("https://openlibrary.org/works/OL27448W")).toBe(true);
  });
  it("is true for TMDB numeric ids", () => {
    expect(hasCanonicalIdInUrl("https://www.themoviedb.org/movie/155")).toBe(true);
    expect(hasCanonicalIdInUrl("https://www.themoviedb.org/tv/1396")).toBe(true);
  });
  it("is false for a bare restaurant or venue URL", () => {
    expect(hasCanonicalIdInUrl("https://www.google.com/maps/place/Selva")).toBe(false);
    expect(hasCanonicalIdInUrl("https://selva-lisboa.com/")).toBe(false);
  });
  it("is false for malformed input", () => {
    expect(hasCanonicalIdInUrl("not a url")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/enrichment/url-identity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/enrichment/url-identity.ts`:

```typescript
/**
 * Whether a URL contains a canonical entity ID that pins it to one specific
 * work/title. When true, the entity is Tier-1 identifiable and phase-1 world
 * knowledge can fill it — so phase-2 grounding is unnecessary.
 */
const ID_PATTERNS: Array<{ host: RegExp; path: RegExp }> = [
  { host: /(^|\.)imdb\.com$/i, path: /\/title\/tt\d+/i },
  { host: /(^|\.)goodreads\.com$/i, path: /\/book\/show\/\d+/i },
  { host: /(^|\.)openlibrary\.org$/i, path: /\/works\/OL\d+W/i },
  { host: /(^|\.)themoviedb\.org$/i, path: /\/(movie|tv)\/\d+/i },
  { host: /(^|\.)letterboxd\.com$/i, path: /\/film\/[^/]+/i },
];

export function hasCanonicalIdInUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;
  return ID_PATTERNS.some((p) => p.host.test(host) && p.path.test(path));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/enrichment/url-identity.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/url-identity.ts src/lib/enrichment/url-identity.test.ts
git commit -m "feat: add canonical-URL-id detection for grounding eligibility"
```

---

### Task 2: Jina Reader fallback fetcher

**Files:**
- Create: `src/lib/enrichment/jina-reader.ts`
- Create: `src/lib/enrichment/jina-reader.test.ts`

`https://r.jina.ai/<absolute url>` returns clean markdown (renders JS). Gated by `JINA_READER_ENABLED`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/enrichment/jina-reader.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchViaJinaReader } from "@/lib/enrichment/jina-reader";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.stubEnv("JINA_READER_ENABLED", "true");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchViaJinaReader", () => {
  it("returns null when the flag is off", async () => {
    vi.stubEnv("JINA_READER_ENABLED", "false");
    expect(await fetchViaJinaReader("https://example.com/x")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches r.jina.ai and returns markdown + parsed title", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "Title: Selva — Lisbon\n\nA tasting-menu restaurant in Lisbon.",
    });

    const result = await fetchViaJinaReader("https://selva-lisboa.com/");

    expect(fetchMock.mock.calls[0][0].toString()).toBe("https://r.jina.ai/https://selva-lisboa.com/");
    expect(result?.title).toBe("Selva — Lisbon");
    expect(result?.markdown).toContain("tasting-menu restaurant");
  });

  it("caps markdown at MAX_PAGE_TEXT_CHARS", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "x".repeat(20000) });
    const result = await fetchViaJinaReader("https://example.com/x");
    expect((result?.markdown ?? "").length).toBeLessThanOrEqual(4000);
  });

  it("returns null on non-200, empty body, or fetch error", async () => {
    fetchMock.mockResolvedValue({ ok: false, text: async () => "" });
    expect(await fetchViaJinaReader("https://example.com/x")).toBeNull();

    fetchMock.mockResolvedValue({ ok: true, text: async () => "   " });
    expect(await fetchViaJinaReader("https://example.com/x")).toBeNull();

    fetchMock.mockRejectedValue(new Error("net"));
    expect(await fetchViaJinaReader("https://example.com/x")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/enrichment/jina-reader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/enrichment/jina-reader.ts`:

```typescript
import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import { MAX_PAGE_TEXT_CHARS } from "@/lib/enrichment/page-text";

const DEFAULT_TIMEOUT_MS = 8000;
const READER_BASE = "https://r.jina.ai/";

export type JinaReaderResult = { markdown: string; title: string | null } | null;

function parseTitle(markdown: string): string | null {
  const m = markdown.match(/^Title:\s*(.+)$/m);
  return m ? m[1].trim() || null : null;
}

/**
 * Last-resort readability fallback for bot-walled / JS-only pages with no
 * capture snapshot. Sends the saved URL to a third party (Jina), so it is
 * gated behind JINA_READER_ENABLED (default off) and fails open.
 */
export async function fetchViaJinaReader(targetUrl: string): Promise<JinaReaderResult> {
  if (process.env.JINA_READER_ENABLED !== "true") return null;

  // r.jina.ai takes the absolute target URL appended to its base.
  const url = new URL(`${READER_BASE}${targetUrl}`);
  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  const timeoutEnv = Number.parseInt(process.env.JINA_READER_TIMEOUT_MS ?? "", 10);
  const timeoutMs = Number.isFinite(timeoutEnv) && timeoutEnv > 0 ? timeoutEnv : DEFAULT_TIMEOUT_MS;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "text/markdown" },
    });
    if (!res.ok) return null;
    const body = (await res.text()).trim();
    if (!body) return null;
    return { markdown: body.slice(0, MAX_PAGE_TEXT_CHARS), title: parseTitle(body) };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/enrichment/jina-reader.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/jina-reader.ts src/lib/enrichment/jina-reader.test.ts
git commit -m "feat: add Jina Reader fallback fetcher for blocked pages (opt-in)"
```

---

### Task 3: Eligibility exposes `groundingRecommended`

**Files:**
- Modify: `src/lib/enrichment/llm/eligibility.ts`
- Test: `src/lib/enrichment/llm/eligibility.test.ts`

Add a boolean to the eligibility result, true when grounding should run: flag on + blocked/sparse-or-uncategorized + not Tier-1 identifiable.

- [ ] **Step 1: Add failing tests**

Append to `src/lib/enrichment/llm/eligibility.test.ts`:

```typescript
describe("decideLlmEligibility groundingRecommended", () => {
  const base = {
    enabled: true,
    hasApiKey: true,
    title: null,
    description: null,
    structured: {},
  };

  it("recommends grounding for a blocked, non-identifiable page when flag on", () => {
    const result = decideLlmEligibility({
      ...base,
      fetchBlocked: true,
      category: "restaurants",
      groundingEnabled: true,
      canonicalUrl: "https://www.google.com/maps/place/Selva",
    });
    expect(result.eligible).toBe(true);
    expect(result.groundingRecommended).toBe(true);
  });

  it("does NOT recommend grounding for an identifiable URL", () => {
    const result = decideLlmEligibility({
      ...base,
      fetchBlocked: true,
      category: "movies_and_tv",
      groundingEnabled: true,
      canonicalUrl: "https://www.imdb.com/title/tt0468569/",
    });
    expect(result.groundingRecommended).toBe(false);
  });

  it("does NOT recommend grounding when the flag is off", () => {
    const result = decideLlmEligibility({
      ...base,
      fetchBlocked: true,
      category: "restaurants",
      groundingEnabled: false,
      canonicalUrl: "https://selva.example/",
    });
    expect(result.groundingRecommended).toBe(false);
  });

  it("does NOT recommend grounding for a healthy page", () => {
    const result = decideLlmEligibility({
      enabled: true,
      hasApiKey: true,
      fetchBlocked: false,
      category: "articles",
      title: "A complete title",
      description: "A sufficiently long description that clears the thresholds for enrichment.",
      structured: { author: "x", publisher: "y", published_at: "2026" },
      groundingEnabled: true,
      canonicalUrl: "https://blog.example/post",
    });
    expect(result.groundingRecommended).toBe(false);
  });

  it("defaults groundingRecommended to false when grounding inputs are omitted", () => {
    const result = decideLlmEligibility({
      ...base,
      fetchBlocked: true,
      category: "restaurants",
    });
    expect(result.groundingRecommended).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify new tests fail**

Run: `npx vitest run src/lib/enrichment/llm/eligibility.test.ts`
Expected: new tests FAIL (`groundingRecommended`, `groundingEnabled`, `canonicalUrl` don't exist).

- [ ] **Step 3: Implement**

In `src/lib/enrichment/llm/eligibility.ts`:

Add the import:

```typescript
import { hasCanonicalIdInUrl } from "@/lib/enrichment/url-identity";
```

Extend `LlmEligibilityInput` with two optional fields (optional ⇒ existing callers/tests still compile):

```typescript
export type LlmEligibilityInput = {
  enabled: boolean;
  hasApiKey: boolean;
  fetchBlocked: boolean;
  fetchSparse?: boolean;
  category: ItemCategory | null;
  categorySource?: CategorySource;
  title: string | null;
  description: string | null;
  image_url?: string | null;
  structured: Record<string, unknown>;
  /** Phase 2: grounding opt-in flag and the URL used for identity detection. */
  groundingEnabled?: boolean;
  canonicalUrl?: string;
};
```

Add `groundingRecommended: boolean` to BOTH branches of the `LlmEligibility` union:

```typescript
export type LlmEligibility =
  | ({ eligible: true; reason: "sparse_category_fields" | "blocked_or_sparse_fetch" | "weak_title_or_description" | "uncategorized"; groundingRecommended: boolean } & CategorySuggestionDecision)
  | ({ eligible: false; reason: "disabled" | "missing_api_key" | "deterministic_data_sufficient"; groundingRecommended: false } & CategorySuggestionDecision);
```

Add a helper above `decideLlmEligibility`:

```typescript
function decideGrounding(input: LlmEligibilityInput, eligible: boolean, reason: string): boolean {
  if (!eligible) return false;
  if (input.groundingEnabled !== true) return false;
  // Grounding helps blocked/sparse/uncategorized cases that aren't already
  // pinned to a known entity by their URL.
  const groundableReason =
    reason === "blocked_or_sparse_fetch" || reason === "uncategorized" || reason === "sparse_category_fields";
  if (!groundableReason) return false;
  if (input.canonicalUrl && hasCanonicalIdInUrl(input.canonicalUrl)) return false;
  return true;
}
```

Update each `return` in `decideLlmEligibility` to include `groundingRecommended`. The not-eligible returns use `groundingRecommended: false`; the eligible returns compute it. Concretely:

```typescript
export function decideLlmEligibility(input: LlmEligibilityInput): LlmEligibility {
  const categorySuggestion = decideCategorySuggestion(input);

  if (!input.enabled) return { eligible: false, reason: "disabled", groundingRecommended: false, ...categorySuggestion };
  if (!input.hasApiKey) return { eligible: false, reason: "missing_api_key", groundingRecommended: false, ...categorySuggestion };
  if (input.category === null) {
    return { eligible: true, reason: "uncategorized", groundingRecommended: decideGrounding(input, true, "uncategorized"), ...categorySuggestion };
  }
  if (input.fetchBlocked || input.fetchSparse === true) {
    return { eligible: true, reason: "blocked_or_sparse_fetch", groundingRecommended: decideGrounding(input, true, "blocked_or_sparse_fetch"), ...categorySuggestion };
  }

  const importantFields = importantFieldsByCategory[input.category];
  const usefulFieldCount = importantFields.filter((field) => hasUsefulValue(input.structured[field])).length;
  if (usefulFieldCount < Math.min(2, importantFields.length)) {
    return { eligible: true, reason: "sparse_category_fields", groundingRecommended: decideGrounding(input, true, "sparse_category_fields"), ...categorySuggestion };
  }

  if (isWeakTitle(input.title) || !input.description?.trim() || input.description.trim().length < 30) {
    return { eligible: true, reason: "weak_title_or_description", groundingRecommended: decideGrounding(input, true, "weak_title_or_description"), ...categorySuggestion };
  }

  return { eligible: false, reason: "deterministic_data_sufficient", groundingRecommended: false, ...categorySuggestion };
}
```

(`wouldBenefitFromLlmReenrichment` still works — it reads `.eligible` only.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/enrichment/llm/eligibility.test.ts`
Expected: PASS (existing + new). Existing tests don't pass `groundingEnabled`, so `groundingRecommended` is `false` for them — no assertions break.

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/llm/eligibility.ts src/lib/enrichment/llm/eligibility.test.ts
git commit -m "feat: eligibility recommends grounding for blocked, non-identifiable items"
```

---

### Task 4: Grounded search step-1 call

**Files:**
- Create: `src/lib/enrichment/llm/grounded-search.ts`
- Create: `src/lib/enrichment/llm/grounded-search.test.ts`

A single `googleSearch`-tool call that returns grounded free text. No JSON schema (grounding + strict schema can't combine).

- [ ] **Step 1: Write the failing test**

Create `src/lib/enrichment/llm/grounded-search.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
}));

import { groundedLookup } from "@/lib/enrichment/llm/grounded-search";

describe("groundedLookup", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
  });
  afterEach(() => vi.unstubAllEnvs());

  const input = { finalUrl: "https://maps.google.com/place/Selva", title: "Selva" };

  it("skips when GEMINI_API_KEY is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await groundedLookup(input)).toBeNull();
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it("calls the SDK with the googleSearch tool and returns grounded text", async () => {
    generateContentMock.mockResolvedValue({
      text: "Selva is a tasting-menu restaurant in Lisbon, Portugal serving modern Portuguese cuisine.",
    });

    const text = await groundedLookup(input);

    expect(text).toContain("Lisbon");
    const callArg = generateContentMock.mock.calls[0][0];
    expect(callArg.config.tools).toEqual([{ googleSearch: {} }]);
    expect(callArg.config.responseJsonSchema).toBeUndefined();
    expect(callArg.contents).toContain("https://maps.google.com/place/Selva");
  });

  it("returns null on empty text or SDK error", async () => {
    generateContentMock.mockResolvedValue({ text: "   " });
    expect(await groundedLookup(input)).toBeNull();
    generateContentMock.mockRejectedValue(new Error("boom"));
    expect(await groundedLookup(input)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/enrichment/llm/grounded-search.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/enrichment/llm/grounded-search.ts`:

```typescript
import "server-only";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_TIMEOUT_MS = 15000;

export type GroundedLookupInput = {
  finalUrl: string;
  title: string | null;
};

function buildGroundedPrompt(input: GroundedLookupInput): string {
  return [
    "Identify the specific item at this URL using Google Search.",
    "Report its name, type/category, and any of: location/address, cuisine, brand, author/creator, year, publisher.",
    "Only state facts you find via search. If you cannot identify it, say so plainly.",
    "Keep it under 120 words.",
    "",
    `URL: ${input.finalUrl}`,
    `Known title (may be weak/missing): ${input.title ?? "(none)"}`,
  ].join("\n");
}

/**
 * Step 1 of the grounded two-step: a Google-Search-grounded free-text answer.
 * Grounding and strict JSON schema cannot combine, so this returns prose that
 * a second schema-enforced call structures. Fails open (null).
 */
export async function groundedLookup(input: GroundedLookupInput): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const timeoutEnv = Number.parseInt(process.env.GROUNDING_TIMEOUT_MS ?? "", 10);
  const timeoutMs = Number.isFinite(timeoutEnv) && timeoutEnv > 0 ? timeoutEnv : DEFAULT_TIMEOUT_MS;
  const model = process.env.GROUNDING_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: buildGroundedPrompt(input),
      config: {
        abortSignal: controller.signal,
        temperature: 0.1,
        tools: [{ googleSearch: {} }],
      },
    });
    const text = typeof response.text === "string" ? response.text.trim() : "";
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/enrichment/llm/grounded-search.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/llm/grounded-search.ts src/lib/enrichment/llm/grounded-search.test.ts
git commit -m "feat: add Google Search grounded lookup (step 1 of grounded two-step)"
```

---

### Task 5: Wire grounding into the enhancer (two-step)

**Files:**
- Modify: `src/lib/enrichment/llm/gemini-category-enhancer.ts`
- Test: `src/lib/enrichment/llm/gemini-category-enhancer.test.ts`

Add an optional `groundingRecommended` to `GeminiCategoryInput`. When true, run `groundedLookup` first; if it returns text, fold it into `pageText` (prefixed so the model treats it as searched evidence) and tag structured fields `"grounded_search"` via a sentinel in the prompt input. Simplest robust approach: prepend the grounded text to `pageText` and set a flag the merge can read. Since the merge labels come from the model's own `field_sources`, we instruct via the existing prompt by appending the grounded text to `pageText` with a marker; the model is told (phase-1 v3 prompt) to label searched facts `grounded_search`.

To keep this minimal and within the existing schema-enforced path, the enhancer:
1. calls `groundedLookup` when `groundingRecommended`,
2. merges grounded text into `pageText`,
3. proceeds with the normal phase-1 generateContent flow.

- [ ] **Step 1: Add failing tests**

Append to `src/lib/enrichment/llm/gemini-category-enhancer.test.ts`. Add a mock for the grounded module at the top of the file (near the existing `@google/genai` mock):

```typescript
const groundedLookupMock = vi.fn();
vi.mock("@/lib/enrichment/llm/grounded-search", () => ({ groundedLookup: groundedLookupMock }));
```

Then:

```typescript
describe("enhanceCategoryWithGemini grounding two-step", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    groundedLookupMock.mockReset();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
  });
  afterEach(() => vi.unstubAllEnvs());

  const groundingInput = {
    ...baseInput,
    category: "restaurants" as const,
    categorySuggestionAllowed: true,
    categorySuggestionReason: "blocked_or_sparse_fetch",
    pageText: null,
    groundingRecommended: true,
  };

  it("runs grounded lookup first and feeds its text into the structuring call", async () => {
    groundedLookupMock.mockResolvedValue("Selva is a tasting-menu restaurant in Lisbon.");
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        confidence: 0.6,
        sources: ["grounded_search"],
        structured: { place_name: "Selva", cuisine: "Portuguese" },
        field_sources: { place_name: "grounded_search", cuisine: "grounded_search" },
        category_suggestion: "restaurants",
        category_confidence: 0.7,
      }),
    });

    const result = await enhanceCategoryWithGemini(groundingInput);

    expect(groundedLookupMock).toHaveBeenCalledOnce();
    expect(result.status).toBe("enhanced");
    // grounded text reached the structuring prompt
    expect(generateContentMock.mock.calls[0][0].contents).toContain("tasting-menu restaurant in Lisbon");
  });

  it("does not call grounded lookup when groundingRecommended is false", async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ confidence: 0.5, sources: ["url"] }) });
    await enhanceCategoryWithGemini({ ...groundingInput, groundingRecommended: false });
    expect(groundedLookupMock).not.toHaveBeenCalled();
  });

  it("proceeds normally when grounded lookup returns null", async () => {
    groundedLookupMock.mockResolvedValue(null);
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ confidence: 0.4, sources: ["url"] }) });
    const result = await enhanceCategoryWithGemini(groundingInput);
    expect(result.status).toBe("enhanced");
  });
});
```

- [ ] **Step 2: Run to verify new tests fail**

Run: `npx vitest run src/lib/enrichment/llm/gemini-category-enhancer.test.ts`
Expected: new tests FAIL (`groundingRecommended` not in input; grounded module not called).

- [ ] **Step 3: Implement**

In `src/lib/enrichment/llm/gemini-category-enhancer.ts`:

Add the import:

```typescript
import { groundedLookup } from "@/lib/enrichment/llm/grounded-search";
```

Add the field to `GeminiCategoryInput`:

```typescript
  /** Phase 2: when true, run a grounded Google-Search lookup before structuring. */
  groundingRecommended?: boolean;
```

At the start of `enhanceCategoryWithGemini`, after the `apiKey` guard and before building the prompt, fold grounded text into a local `pageText`:

```typescript
  let effectivePageText = input.pageText;
  let groundedUsed = false;
  if (input.groundingRecommended) {
    const grounded = await groundedLookup({ finalUrl: input.finalUrl, title: input.title });
    if (grounded) {
      groundedUsed = true;
      effectivePageText = effectivePageText
        ? `Search findings (treat as grounded_search evidence): ${grounded}\n\n${effectivePageText}`
        : `Search findings (treat as grounded_search evidence): ${grounded}`;
    }
  }

  const prompt = buildGeminiCategoryPromptV3({ ...input, pageText: effectivePageText });
```

(Replace the existing `const prompt = buildGeminiCategoryPromptV3(input);` line with the block above.)

When returning the enhanced result, record whether grounding was used in `providerMetadata` (helps audit):

```typescript
      if (normalized.status === "enhanced") {
        return {
          ...normalized,
          providerMetadata: { ...normalized.providerMetadata, model, grounded: groundedUsed },
        };
      }
```

- [ ] **Step 4: Run to verify it passes + type check**

Run: `npx vitest run src/lib/enrichment/llm/gemini-category-enhancer.test.ts; npx tsc --noEmit`
Expected: PASS / clean (the `enrich-item.ts` caller doesn't yet pass `groundingRecommended`, which is optional, so no type break).

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/llm/gemini-category-enhancer.ts src/lib/enrichment/llm/gemini-category-enhancer.test.ts
git commit -m "feat: grounded two-step in the enhancer — searched text feeds the schema call"
```

---

### Task 6: Integrate Jina + grounding flag into `enrichItem`  ⚠️ SHARED FILE

**Files:**
- Modify: `src/lib/jobs/enrich-item.ts`

Two edits: (1) a Jina fallback in evidence-gathering (top of the `try`), and (2) pass `groundingEnabled`/`canonicalUrl` into `decideLlmEligibility` and `groundingRecommended` into `enhanceCategoryWithGemini` (the eligibility/LLM-call region). See the parallel-execution section before running this with a Phase 3 session.

- [ ] **Step 1: Add imports**

In `src/lib/jobs/enrich-item.ts`:

```typescript
import { fetchViaJinaReader } from "@/lib/enrichment/jina-reader";
```

- [ ] **Step 2: Jina fallback in evidence-gathering**

Locate the line that computes `pageText`:

```typescript
    const pageText = snapshot?.text ?? (openLibrary ? null : extractPageText(fetchResult.html));
```

Replace that single line with a `jinaResult` holder plus a `let pageText` and a Jina fallback that triggers only when there's no snapshot, the fetch looks blocked/empty, and no usable page text was extracted. `mergedRawMetadata` is declared later in the function, so the Jina result is held in a local and folded into `mergedRawMetadata` at its initializer (next sub-step):

```typescript
    let jinaResult: Awaited<ReturnType<typeof fetchViaJinaReader>> = null;
    let pageText = snapshot?.text ?? (openLibrary ? null : extractPageText(fetchResult.html));
    // Phase 2: when a server fetch was blocked/empty and there's no snapshot,
    // try the Jina Reader readability proxy (opt-in, fail-open).
    if (!snapshot && !openLibrary) {
      const blockedOrEmpty = isBotBlockPage(fetchResult.html, fetchResult.statusCode) || !pageText;
      if (blockedOrEmpty) {
        jinaResult = await fetchViaJinaReader(row.canonical_url);
        if (jinaResult) pageText = jinaResult.markdown;
      }
    }
```

Then in the `mergedRawMetadata` initializer (currently a single object literal), add the Jina audit + evidence source override:

```typescript
    let mergedRawMetadata: Record<string, unknown> = {
      ...(extracted.raw_metadata as unknown as Record<string, unknown>),
      ...(snapshot
        ? { capture_snapshot: snapshot, evidence_source: "capture_snapshot" }
        : { evidence_source: jinaResult ? "jina_reader" : openLibrary ? "open_library" : "server_fetch" }),
      ...(jinaResult ? { jina: { used: true } } : {}),
    };
```

Also, when Jina returned a title and the extracted title is weak, use it as a fallback title source. After the `mergedTitle` declaration, add:

```typescript
    if (jinaResult?.title && isWeakTitle(mergedTitle)) {
      mergedTitle = jinaResult.title;
    }
```

- [ ] **Step 3: Pass grounding through eligibility + the LLM call**

In the `decideLlmEligibility({ ... })` call, add two fields:

```typescript
      groundingEnabled: process.env.LLM_GROUNDING_ENABLED === "true",
      canonicalUrl: fetchResult.finalUrl,
```

In the `enhanceCategoryWithGemini({ ... })` call, pass the recommendation through:

```typescript
        groundingRecommended: llmEligibility.eligible ? llmEligibility.groundingRecommended : false,
```

(`llmEligibility.groundingRecommended` exists on the eligible branch; the guard keeps TypeScript happy.)

- [ ] **Step 4: Type check + full suite**

Run: `npx tsc --noEmit; npm test`
Expected: clean; all green. With both flags off (default), behavior is identical to phase 1 — Jina returns null (flag off) and grounding is never recommended.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/enrich-item.ts
git commit -m "feat: enrichment falls back to Jina Reader and triggers grounded lookup when configured"
```

---

### Task 7: Env, docs, and final verification  ⚠️ SHARED DOCS

**Files:**
- Modify: `.env.local.example`
- Modify: `docs/qa-checklist.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Document the new flags**

In `.env.local.example`, after the Gemini enrichment block, add:

```bash
# Phase 2 enrichment fallbacks (both opt-in, default off).
# Jina Reader renders JS / bypasses many bot walls but sends the saved URL to a
# third party (r.jina.ai). Grounding uses Gemini Google Search for non-identifiable
# items (restaurants, travel); free tier ~1,500 grounded queries/day.
JINA_READER_ENABLED=false
LLM_GROUNDING_ENABLED=false
# JINA_READER_TIMEOUT_MS=8000
# GROUNDING_TIMEOUT_MS=15000
# GROUNDING_MODEL=gemini-2.5-flash-lite
```

- [ ] **Step 2: Add QA rows**

Append to `docs/qa-checklist.md`:

```markdown
## Blocked-page fallbacks (phase 2)

| URL | Client | Flags | Expected |
|-----|--------|-------|----------|
| Bot-walled product/article (no snapshot) | Manual add | `JINA_READER_ENABLED=true` | Page text recovered via Jina; `raw_metadata.evidence_source = "jina_reader"`; card gets a real title/description |
| Restaurant via Google Maps / Yelp | Manual add | `LLM_GROUNDING_ENABLED=true` | `place_name`/`cuisine` filled; `raw_metadata.llm.field_sources` shows `grounded_search`; `raw_metadata.llm.grounded = true` |
| IMDb title link (identifiable) | Manual add | `LLM_GROUNDING_ENABLED=true` | Grounding is SKIPPED (URL has canonical id); world knowledge fills fields instead |
```

- [ ] **Step 3: Note fallbacks in AGENTS.md**

Add one line under the enrichment conventions in `AGENTS.md`:

```markdown
- Blocked/sparse, snapshot-less pages can fall back to Jina Reader (`JINA_READER_ENABLED`) and Gemini Google Search grounding (`LLM_GROUNDING_ENABLED`); both opt-in, default off, fail-open. Grounding is skipped when the URL already contains a canonical entity id (`src/lib/enrichment/url-identity.ts`).
```

- [ ] **Step 4: Full verification**

Run: `npm test; npm run build`
Expected: all green; clean build.

- [ ] **Step 5: Commit**

```bash
git add .env.local.example docs/qa-checklist.md AGENTS.md
git commit -m "docs: document Jina Reader and grounded-search enrichment fallbacks"
```

---

## Parallel execution with Phase 3

- **Tasks 1, 2, 4** create only NEW files (`url-identity.ts`, `jina-reader.ts`, `grounded-search.ts`) — independent of Phase 3.
- **Task 3** edits `src/lib/enrichment/llm/eligibility.ts` and **Task 5** edits `src/lib/enrichment/llm/gemini-category-enhancer.ts`. Phase 3 does NOT touch either file — no conflict.
- **Task 6** edits the shared `src/lib/jobs/enrich-item.ts` (evidence-gathering region near `pageText`, and the eligibility/LLM-call region). Phase 3's Task 7 edits the same file in the region between the `merged*` declarations and `fetchBlocked`. Adjacent regions ⇒ a naive merge may conflict.
- **Task 7** edits shared docs (append-only ⇒ trivial conflicts).

**Verdict & recommended protocol** (also stated in the Phase 3 plan):
1. Run both sessions in parallel off the same base branch. ~90% of each plan (all new modules + their integration into phase-specific files) proceeds with zero contention.
2. The only true contention is `src/lib/jobs/enrich-item.ts` and the three shared doc files.
3. **Land Phase 3 first** (Task 7 is small, additive, lower risk). Then the Phase 2 session rebases/merges `master`, re-applies its `enrich-item.ts` edits (Task 6) on top, and re-runs `npx tsc --noEmit; npm test`. The two `enrich-item.ts` edits are in different regions and resolve cleanly by hand.
4. Shared-doc conflicts are append-only sections and resolve by keeping both.

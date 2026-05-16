# Gemini Category Enrichment Final Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Theque's category-specific `structured` metadata with a gated, server-only Gemini normalization step while keeping deterministic classification and manual category overrides authoritative.

**Architecture:** The existing enrichment job remains the source of truth for fetching, parsing, deterministic fallbacks, and category classification. Gemini runs only after deterministic classification, only when enabled and eligible, returns validated fields for the fixed category, and merges conservatively so parser output is not degraded.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres, existing background enrichment jobs, Vitest, official Gemini API/SDK selected after current-doc verification. The implementing agent has access to Context7 MCP and should use it for current library/API documentation research before coding provider integration.

---

## Product Decisions

- Gemini is v1's only LLM provider.
- Perplexity Pro web access must not be automated. A future Perplexity API can be added as an evidence-provider slot, but this plan does not implement it.
- `src/lib/classify/index.ts` remains the only classification path.
- Gemini must not change `category`, `category_source`, or `category_confidence`.
- Manual category overrides must remain preserved.
- Gemini credentials must stay server-only. Do not use `NEXT_PUBLIC_` env vars.
- Gemini failures must fail open: deterministic enrichment still saves the item as `ready`.
- Model output must be validated before writing anything to Supabase.

---

## File Structure

- Create `src/lib/enrichment/llm/category-schemas.ts`: allowed LLM output shape, category-specific field validators, and type guards.
- Create `src/lib/enrichment/llm/category-schemas.test.ts`: validation tests for accepted and rejected fields.
- Create `src/lib/enrichment/llm/eligibility.ts`: env and sparsity rules for deciding whether Gemini should run.
- Create `src/lib/enrichment/llm/eligibility.test.ts`: eligibility tests.
- Create `src/lib/enrichment/llm/gemini-category-enhancer.ts`: server-only provider wrapper, prompt construction, timeout/error handling, and typed result.
- Create `src/lib/enrichment/llm/gemini-category-enhancer.test.ts`: mocked provider tests.
- Create `src/lib/enrichment/llm/merge-llm-enrichment.ts`: safe merge rules and `raw_metadata.llm` audit metadata.
- Create `src/lib/enrichment/llm/merge-llm-enrichment.test.ts`: merge tests.
- Modify `src/lib/jobs/enrich-item.ts`: call eligibility, enhancer, and merge after deterministic classification and before final database update.
- Modify `.env.local.example`: document `GEMINI_API_KEY` and `LLM_ENRICHMENT_ENABLED`.
- Modify `docs/category-schemas.md`: document `raw_metadata.llm` and v1 merge behavior.

---

## Task 1: Verify Provider And Install Dependency

**Files:**
- Inspect: `package.json`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Verify current Gemini structured-output support with Context7 MCP**

Use Context7 MCP for current documentation research before installing anything. Check:

```text
Gemini API structured output JSON schema
Gemini API Node SDK generateContent responseMimeType application/json
Gemini model IDs available for API-key usage
```

Expected: current docs confirm a Node-compatible API that can request JSON output with a schema.

- [ ] **Step 2: Choose direct Gemini API/SDK**

Use the direct official Gemini SDK/API for v1 unless current docs reveal a blocker. Do not add Vercel AI SDK for this background-only normalization step.

Expected: provider-specific logic is isolated to `src/lib/enrichment/llm/gemini-category-enhancer.ts`.

- [ ] **Step 3: Install the dependency**

Run:

```bash
npm install @google/genai
```

Expected: `package.json` and `package-lock.json` contain the new dependency, and no unrelated dependencies are added.

---

## Task 2: Define LLM Category Output Contracts

**Files:**
- Create: `src/lib/enrichment/llm/category-schemas.ts`
- Create: `src/lib/enrichment/llm/category-schemas.test.ts`
- Reference: `docs/category-schemas.md`

- [ ] **Step 1: Write failing validation tests**

Create `src/lib/enrichment/llm/category-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { validateLlmCategoryEnhancement } from "@/lib/enrichment/llm/category-schemas";

describe("validateLlmCategoryEnhancement", () => {
  it("accepts valid movie fields", () => {
    const result = validateLlmCategoryEnhancement("movies_and_tv", {
      title: "Inception",
      subtitle: "Christopher Nolan · 2010",
      description: "A dream thief is offered a chance to erase his criminal record.",
      structured: {
        year: 2010,
        directors: ["Christopher Nolan"],
        runtime_minutes: 148,
        genres: ["Action", "Sci-Fi"],
        media_type: "movie",
      },
      confidence: 0.84,
      sources: ["open_graph", "json_ld"],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects fields from the wrong category", () => {
    const result = validateLlmCategoryEnhancement("books", {
      structured: {
        directors: ["Wrong category"],
      },
      confidence: 0.7,
      sources: ["model"],
    });

    expect(result.ok).toBe(false);
  });

  it("rejects invalid confidence values", () => {
    const result = validateLlmCategoryEnhancement("articles", {
      structured: {
        author: "Jane Doe",
      },
      confidence: 2,
      sources: ["open_graph"],
    });

    expect(result.ok).toBe(false);
  });
});
```

Run:

```bash
npm test -- src/lib/enrichment/llm/category-schemas.test.ts
```

Expected: tests fail because the module does not exist yet.

- [ ] **Step 2: Implement the validator**

Create `src/lib/enrichment/llm/category-schemas.ts`:

```ts
import type { ItemCategory } from "@/lib/database.types";

export type LlmCategoryEnhancement = {
  title?: string;
  subtitle?: string;
  description?: string;
  image_url?: string;
  structured?: Record<string, unknown>;
  confidence: number;
  sources: string[];
  notes?: string;
};

export type LlmValidationResult =
  | { ok: true; value: LlmCategoryEnhancement }
  | { ok: false; reason: string };

const allowedStructuredFields: Record<ItemCategory, Set<string>> = {
  books: new Set(["authors", "isbn", "published_year", "page_count", "average_rating", "ratings_count"]),
  movies_and_tv: new Set(["year", "directors", "runtime_minutes", "genres", "media_type", "rating", "rating_scale"]),
  restaurants: new Set(["cuisine", "price_level", "address", "place_name"]),
  products: new Set(["brand", "price", "availability"]),
  gifts: new Set(["recipient_hint", "occasion", "price"]),
  travel: new Set(["destination", "travel_dates", "lodging_name"]),
  recipes: new Set(["author", "prep_time_minutes", "cook_time_minutes", "yield", "ingredients"]),
  articles: new Set(["author", "published_at", "reading_time_minutes", "publisher"]),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
}

export function validateLlmCategoryEnhancement(
  category: ItemCategory,
  value: unknown,
): LlmValidationResult {
  if (!isRecord(value)) return { ok: false, reason: "output_not_object" };

  const confidence = value.confidence;
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    return { ok: false, reason: "invalid_confidence" };
  }

  if (!isNonEmptyStringArray(value.sources)) {
    return { ok: false, reason: "invalid_sources" };
  }

  for (const key of ["title", "subtitle", "description", "image_url", "notes"]) {
    const field = value[key];
    if (field !== undefined && typeof field !== "string") {
      return { ok: false, reason: `invalid_${key}` };
    }
  }

  const structured = value.structured;
  if (structured !== undefined) {
    if (!isRecord(structured)) return { ok: false, reason: "invalid_structured" };
    const allowed = allowedStructuredFields[category];
    for (const key of Object.keys(structured)) {
      if (!allowed.has(key)) return { ok: false, reason: `unknown_structured_field:${key}` };
    }
  }

  return {
    ok: true,
    value: {
      title: typeof value.title === "string" ? value.title : undefined,
      subtitle: typeof value.subtitle === "string" ? value.subtitle : undefined,
      description: typeof value.description === "string" ? value.description : undefined,
      image_url: typeof value.image_url === "string" ? value.image_url : undefined,
      structured: isRecord(structured) ? structured : undefined,
      confidence,
      sources: value.sources,
      notes: typeof value.notes === "string" ? value.notes : undefined,
    },
  };
}
```

Expected: validation accepts only fields documented for the deterministic category.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- src/lib/enrichment/llm/category-schemas.test.ts
```

Expected: category schema tests pass.

---

## Task 3: Add LLM Eligibility Gate

**Files:**
- Create: `src/lib/enrichment/llm/eligibility.ts`
- Create: `src/lib/enrichment/llm/eligibility.test.ts`

- [ ] **Step 1: Write failing eligibility tests**

Create `src/lib/enrichment/llm/eligibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { decideLlmEligibility } from "@/lib/enrichment/llm/eligibility";

const baseInput = {
  enabled: true,
  hasApiKey: true,
  fetchBlocked: false,
  category: "books" as const,
  title: "A Real Book",
  description: "A useful description with enough detail.",
  structured: {
    authors: ["Jane Doe"],
    published_year: 2024,
  },
};

describe("decideLlmEligibility", () => {
  it("skips when disabled", () => {
    expect(decideLlmEligibility({ ...baseInput, enabled: false }).eligible).toBe(false);
  });

  it("skips without an API key", () => {
    expect(decideLlmEligibility({ ...baseInput, hasApiKey: false }).eligible).toBe(false);
  });

  it("runs for sparse structured fields", () => {
    const result = decideLlmEligibility({ ...baseInput, structured: {} });
    expect(result).toEqual({ eligible: true, reason: "sparse_category_fields" });
  });

  it("runs for blocked fetches", () => {
    const result = decideLlmEligibility({ ...baseInput, fetchBlocked: true });
    expect(result).toEqual({ eligible: true, reason: "blocked_or_sparse_fetch" });
  });

  it("skips when deterministic data is strong enough", () => {
    const result = decideLlmEligibility(baseInput);
    expect(result).toEqual({ eligible: false, reason: "deterministic_data_sufficient" });
  });
});
```

Run:

```bash
npm test -- src/lib/enrichment/llm/eligibility.test.ts
```

Expected: tests fail because the module does not exist yet.

- [ ] **Step 2: Implement eligibility logic**

Create `src/lib/enrichment/llm/eligibility.ts`:

```ts
import type { ItemCategory } from "@/lib/database.types";
import { isWeakTitle } from "@/lib/enrichment/meta-utils";

export type LlmEligibilityInput = {
  enabled: boolean;
  hasApiKey: boolean;
  fetchBlocked: boolean;
  category: ItemCategory;
  title: string | null;
  description: string | null;
  structured: Record<string, unknown>;
};

export type LlmEligibility =
  | { eligible: true; reason: "sparse_category_fields" | "blocked_or_sparse_fetch" | "weak_title_or_description" }
  | { eligible: false; reason: "disabled" | "missing_api_key" | "deterministic_data_sufficient" };

const importantFieldsByCategory: Record<ItemCategory, string[]> = {
  books: ["authors", "published_year"],
  movies_and_tv: ["year", "directors"],
  restaurants: ["place_name", "cuisine", "address"],
  products: ["brand", "price"],
  gifts: ["recipient_hint", "occasion"],
  travel: ["destination", "lodging_name"],
  recipes: ["author", "ingredients"],
  articles: ["author", "publisher", "published_at"],
};

function hasUsefulValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

export function decideLlmEligibility(input: LlmEligibilityInput): LlmEligibility {
  if (!input.enabled) return { eligible: false, reason: "disabled" };
  if (!input.hasApiKey) return { eligible: false, reason: "missing_api_key" };
  if (input.fetchBlocked) return { eligible: true, reason: "blocked_or_sparse_fetch" };

  const importantFields = importantFieldsByCategory[input.category];
  const usefulFieldCount = importantFields.filter((field) => hasUsefulValue(input.structured[field])).length;
  if (usefulFieldCount < Math.min(2, importantFields.length)) {
    return { eligible: true, reason: "sparse_category_fields" };
  }

  if (isWeakTitle(input.title) || !input.description?.trim() || input.description.trim().length < 30) {
    return { eligible: true, reason: "weak_title_or_description" };
  }

  return { eligible: false, reason: "deterministic_data_sufficient" };
}
```

Expected: Gemini is called selectively, keeping cost and latency bounded.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- src/lib/enrichment/llm/eligibility.test.ts
```

Expected: eligibility tests pass.

---

## Task 4: Implement Gemini Category Enhancer

**Files:**
- Create: `src/lib/enrichment/llm/gemini-category-enhancer.ts`
- Create: `src/lib/enrichment/llm/gemini-category-enhancer.test.ts`

- [ ] **Step 1: Write mocked enhancer tests**

Create `src/lib/enrichment/llm/gemini-category-enhancer.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildGeminiCategoryPrompt, normalizeGeminiPayload } from "@/lib/enrichment/llm/gemini-category-enhancer";

describe("buildGeminiCategoryPrompt", () => {
  it("fixes the deterministic category in the prompt", () => {
    const prompt = buildGeminiCategoryPrompt({
      finalUrl: "https://example.com/book",
      category: "books",
      title: "Example Book",
      subtitle: null,
      description: null,
      image_url: null,
      structured: {},
      rawMetadata: {
        fetched_at: "2026-05-16T00:00:00.000Z",
        final_url: "https://example.com/book",
        status_code: 200,
        open_graph: {},
        twitter: {},
        json_ld: [],
        parser: "generic",
      },
    });

    expect(prompt).toContain("The deterministic category is fixed: books");
    expect(prompt).toContain("Do not change or return a different category");
  });
});

describe("normalizeGeminiPayload", () => {
  it("validates provider output before returning it", () => {
    const result = normalizeGeminiPayload("books", {
      structured: { authors: ["Jane Doe"] },
      confidence: 0.8,
      sources: ["open_graph"],
    });

    expect(result.status).toBe("enhanced");
  });

  it("fails closed for invalid provider output", () => {
    const result = normalizeGeminiPayload("books", {
      structured: { directors: ["Wrong"] },
      confidence: 0.8,
      sources: ["model"],
    });

    expect(result.status).toBe("failed");
  });
});
```

Run:

```bash
npm test -- src/lib/enrichment/llm/gemini-category-enhancer.test.ts
```

Expected: tests fail because the module does not exist yet.

- [ ] **Step 2: Implement server-only enhancer boundary**

Create `src/lib/enrichment/llm/gemini-category-enhancer.ts`:

```ts
import "server-only";

import type { ItemCategory } from "@/lib/database.types";
import type { RawMetadata } from "@/lib/enrichment/extract";
import {
  type LlmCategoryEnhancement,
  validateLlmCategoryEnhancement,
} from "@/lib/enrichment/llm/category-schemas";

export type GeminiCategoryInput = {
  finalUrl: string;
  category: ItemCategory;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  structured: Record<string, unknown>;
  rawMetadata: RawMetadata;
};

export type GeminiCategoryResult =
  | {
      status: "enhanced";
      enhancement: LlmCategoryEnhancement;
      providerMetadata: Record<string, unknown>;
    }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export function buildGeminiCategoryPrompt(input: GeminiCategoryInput): string {
  return [
    "You are normalizing metadata for a private visual bookmark library called Theque.",
    `The deterministic category is fixed: ${input.category}.`,
    "Do not change or return a different category.",
    "Use only the provided URL and metadata evidence.",
    "Return only fields allowed for the fixed category.",
    "Omit fields when evidence is insufficient. Do not invent prices, ratings, authors, years, or addresses.",
    "",
    `URL: ${input.finalUrl}`,
    `Title: ${input.title ?? ""}`,
    `Subtitle: ${input.subtitle ?? ""}`,
    `Description: ${input.description ?? ""}`,
    `Image URL: ${input.image_url ?? ""}`,
    `Structured: ${JSON.stringify(input.structured)}`,
    `Open Graph: ${JSON.stringify(input.rawMetadata.open_graph)}`,
    `Twitter: ${JSON.stringify(input.rawMetadata.twitter)}`,
    `JSON-LD: ${JSON.stringify(input.rawMetadata.json_ld)}`,
    `Parser: ${input.rawMetadata.parser}`,
  ].join("\n");
}

export function normalizeGeminiPayload(
  category: ItemCategory,
  payload: unknown,
): GeminiCategoryResult {
  const validation = validateLlmCategoryEnhancement(category, payload);
  if (!validation.ok) return { status: "failed", reason: validation.reason };
  return {
    status: "enhanced",
    enhancement: validation.value,
    providerMetadata: {
      provider: "gemini",
      status: "enhanced",
    },
  };
}

export async function enhanceCategoryWithGemini(input: GeminiCategoryInput): Promise<GeminiCategoryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { status: "skipped", reason: "missing_api_key" };

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const prompt = buildGeminiCategoryPrompt(input);

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    const parsed = typeof text === "string" ? JSON.parse(text) : null;
    const normalized = normalizeGeminiPayload(input.category, parsed);
    if (normalized.status !== "enhanced") return normalized;

    return {
      ...normalized,
      providerMetadata: {
        ...normalized.providerMetadata,
        model,
      },
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "gemini_failed",
    };
  }
}
```

Expected: provider errors are contained inside this module and do not throw into `enrichItem`.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- src/lib/enrichment/llm/gemini-category-enhancer.test.ts
```

Expected: mocked enhancer tests pass without real API calls.

---

## Task 5: Implement Safe Merge

**Files:**
- Create: `src/lib/enrichment/llm/merge-llm-enrichment.ts`
- Create: `src/lib/enrichment/llm/merge-llm-enrichment.test.ts`

- [ ] **Step 1: Write failing merge tests**

Create `src/lib/enrichment/llm/merge-llm-enrichment.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { mergeLlmEnrichment } from "@/lib/enrichment/llm/merge-llm-enrichment";

describe("mergeLlmEnrichment", () => {
  it("fills missing structured fields without overwriting existing values", () => {
    const result = mergeLlmEnrichment({
      current: {
        title: "Existing Title",
        subtitle: null,
        description: null,
        image_url: null,
        structured: { authors: ["Parser Author"] },
        rawMetadata: { parser: "generic" },
      },
      llmResult: {
        status: "enhanced",
        enhancement: {
          title: "LLM Title",
          structured: {
            authors: ["LLM Author"],
            published_year: 2024,
          },
          confidence: 0.8,
          sources: ["open_graph"],
        },
        providerMetadata: { provider: "gemini", model: "gemini-2.5-flash" },
      },
      now: "2026-05-16T00:00:00.000Z",
    });

    expect(result.title).toBe("Existing Title");
    expect(result.structured).toEqual({
      authors: ["Parser Author"],
      published_year: 2024,
    });
    expect(result.rawMetadata.llm).toMatchObject({
      provider: "gemini",
      status: "enhanced",
      confidence: 0.8,
      returned_fields: ["published_year"],
    });
  });

  it("records failed attempts without changing deterministic fields", () => {
    const result = mergeLlmEnrichment({
      current: {
        title: "Existing Title",
        subtitle: null,
        description: "Existing description.",
        image_url: null,
        structured: {},
        rawMetadata: { parser: "generic" },
      },
      llmResult: { status: "failed", reason: "timeout" },
      now: "2026-05-16T00:00:00.000Z",
    });

    expect(result.title).toBe("Existing Title");
    expect(result.rawMetadata.llm).toMatchObject({
      provider: "gemini",
      status: "failed",
      reason: "timeout",
    });
  });
});
```

Run:

```bash
npm test -- src/lib/enrichment/llm/merge-llm-enrichment.test.ts
```

Expected: tests fail because the module does not exist yet.

- [ ] **Step 2: Implement merge rules**

Create `src/lib/enrichment/llm/merge-llm-enrichment.ts`:

```ts
import { isWeakTitle } from "@/lib/enrichment/meta-utils";
import type { GeminiCategoryResult } from "@/lib/enrichment/llm/gemini-category-enhancer";

export type MergeLlmInput = {
  current: {
    title: string | null;
    subtitle: string | null;
    description: string | null;
    image_url: string | null;
    structured: Record<string, unknown>;
    rawMetadata: Record<string, unknown>;
  };
  llmResult: GeminiCategoryResult;
  now: string;
};

export type MergeLlmOutput = MergeLlmInput["current"];

function addLlmMetadata(
  rawMetadata: Record<string, unknown>,
  llm: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...rawMetadata,
    llm,
  };
}

export function mergeLlmEnrichment(input: MergeLlmInput): MergeLlmOutput {
  const current = input.current;

  if (input.llmResult.status !== "enhanced") {
    return {
      ...current,
      rawMetadata: addLlmMetadata(current.rawMetadata, {
        provider: "gemini",
        status: input.llmResult.status,
        reason: input.llmResult.reason,
        enriched_at: input.now,
      }),
    };
  }

  const enhancement = input.llmResult.enhancement;
  const structured = { ...current.structured };
  const returnedFields: string[] = [];

  for (const [key, value] of Object.entries(enhancement.structured ?? {})) {
    if (value === undefined || value === null) continue;
    if (structured[key] === undefined || structured[key] === null || structured[key] === "") {
      structured[key] = value;
      returnedFields.push(key);
    }
  }

  return {
    title: isWeakTitle(current.title) && enhancement.title?.trim() ? enhancement.title.trim() : current.title,
    subtitle: current.subtitle ?? enhancement.subtitle ?? null,
    description:
      (!current.description?.trim() || current.description.trim().length < 30) && enhancement.description?.trim()
        ? enhancement.description.trim()
        : current.description,
    image_url: current.image_url ?? enhancement.image_url ?? null,
    structured,
    rawMetadata: addLlmMetadata(current.rawMetadata, {
      ...input.llmResult.providerMetadata,
      provider: "gemini",
      status: "enhanced",
      confidence: enhancement.confidence,
      sources: enhancement.sources,
      returned_fields: returnedFields,
      enriched_at: input.now,
    }),
  };
}
```

Expected: Gemini fills gaps only and records audit metadata.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- src/lib/enrichment/llm/merge-llm-enrichment.test.ts
```

Expected: merge tests pass.

---

## Task 6: Wire Into `enrichItem`

**Files:**
- Modify: `src/lib/jobs/enrich-item.ts`
- Add tests only if the current test setup can mock the admin client cleanly; otherwise rely on focused unit tests plus full `npm test`.

- [ ] **Step 1: Import LLM modules**

In `src/lib/jobs/enrich-item.ts`, add imports:

```ts
import { decideLlmEligibility } from "@/lib/enrichment/llm/eligibility";
import { enhanceCategoryWithGemini } from "@/lib/enrichment/llm/gemini-category-enhancer";
import { mergeLlmEnrichment } from "@/lib/enrichment/llm/merge-llm-enrichment";
```

Expected: imports compile after Tasks 3-5.

- [ ] **Step 2: Add LLM hook after deterministic classification**

After `structuredClean` is created and before final subtitle/title/display calculation, create mutable enrichment fields:

```ts
let mergedStructured = { ...structuredClean };
let mergedRawMetadata = extracted.raw_metadata as unknown as Record<string, unknown>;
let mergedTitle = extracted.title?.trim() || null;
let mergedSubtitle = extracted.subtitle ?? null;
let mergedDescription = extracted.description ?? row.description;
let mergedImageUrl = extracted.image_url ?? row.image_url;
```

Then call eligibility and enhancer:

```ts
const fetchBlocked = isBotBlockPage(fetchResult.html, fetchResult.statusCode);
const llmEligibility = decideLlmEligibility({
  enabled: process.env.LLM_ENRICHMENT_ENABLED === "true",
  hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  fetchBlocked,
  category: classification.category,
  title: mergedTitle,
  description: mergedDescription,
  structured: mergedStructured,
});

if (llmEligibility.eligible) {
  const llmResult = await enhanceCategoryWithGemini({
    finalUrl: fetchResult.finalUrl,
    category: classification.category,
    title: mergedTitle,
    subtitle: mergedSubtitle,
    description: mergedDescription,
    image_url: mergedImageUrl,
    structured: mergedStructured,
    rawMetadata: extracted.raw_metadata,
  });

  const merged = mergeLlmEnrichment({
    current: {
      title: mergedTitle,
      subtitle: mergedSubtitle,
      description: mergedDescription,
      image_url: mergedImageUrl,
      structured: mergedStructured,
      rawMetadata: mergedRawMetadata,
    },
    llmResult,
    now: new Date().toISOString(),
  });

  mergedTitle = merged.title;
  mergedSubtitle = merged.subtitle;
  mergedDescription = merged.description;
  mergedImageUrl = merged.image_url;
  mergedStructured = merged.structured;
  mergedRawMetadata = merged.rawMetadata;
}
```

Expected: Gemini failure is contained in `llmResult` and does not enter the outer enrichment catch block.

- [ ] **Step 3: Use merged fields for final title and update**

Adjust the existing final-title logic to start from `mergedTitle` instead of `extracted.title`, and use merged fields in the database update:

```ts
const subtitle = mergedSubtitle ?? buildSubtitle(classification.category, mergedStructured);

let title = mergedTitle;
```

In the `.update({ ... })` payload:

```ts
description: mergedDescription,
image_url: mergedImageUrl,
structured: mergedStructured as Json,
raw_metadata: mergedRawMetadata as Json,
```

Expected: category columns remain exactly as determined by the existing deterministic/manual logic.

- [ ] **Step 4: Preserve default behavior**

Run with no `LLM_ENRICHMENT_ENABLED` env var:

```bash
npm test
```

Expected: all existing tests pass and enrichment behavior is unchanged when the feature flag is absent.

---

## Task 7: Env, Docs, And Rollout

**Files:**
- Modify: `.env.local.example`
- Modify: `docs/category-schemas.md`

- [ ] **Step 1: Document server-only env vars**

Add to `.env.local.example`:

```bash
GEMINI_API_KEY=
LLM_ENRICHMENT_ENABLED=false
```

Expected: no `NEXT_PUBLIC_` prefix is used.

- [ ] **Step 2: Document `raw_metadata.llm`**

Add this section to `docs/category-schemas.md` after the existing `raw_metadata` shape:

````md
### `raw_metadata.llm`

When LLM enrichment is enabled, Theque records the Gemini attempt for debugging.
Gemini enriches fields only for the deterministic category and does not change
`category`, `category_source`, or `category_confidence`.

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "status": "enhanced",
  "confidence": 0.82,
  "sources": ["open_graph", "json_ld"],
  "returned_fields": ["authors", "published_year"],
  "enriched_at": "2026-05-16T00:00:00.000Z"
}
```
````

Expected: future debugging can explain which fields came from Gemini.

- [ ] **Step 3: Roll out conservatively**

Use this rollout order:

```text
1. Local only with LLM_ENRICHMENT_ENABLED=true.
2. Production deploy with LLM_ENRICHMENT_ENABLED=false.
3. Enable only after local QA on sparse pages from docs/qa-checklist.md.
4. Review raw_metadata.llm on real items before broadening usage.
```

Expected: no surprise model cost or latency spike.

---

## Task 8: Final Verification

**Files:**
- Verify all files touched above.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/lib/enrichment/llm/category-schemas.test.ts
npm test -- src/lib/enrichment/llm/eligibility.test.ts
npm test -- src/lib/enrichment/llm/gemini-category-enhancer.test.ts
npm test -- src/lib/enrichment/llm/merge-llm-enrichment.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: all Vitest tests pass.

- [ ] **Step 3: Run lint and build**

Run:

```bash
npm run lint
npm run build
```

Expected: lint and build pass. `npm run build` also runs extension TypeScript via `npm run build:extension`.

---

## Future Perplexity API Slot

Do not implement this in v1.

Future shape:

```ts
export type ResearchEvidence = {
  provider: "perplexity";
  query: string;
  snippets: string[];
  citations: string[];
  fetched_at: string;
};
```

Future flow:

```text
deterministic metadata evidence
+ optional Perplexity API research evidence
-> Gemini fixed-category normalization
-> same validation and merge path
```

Only add this after choosing Perplexity API billing. Do not automate the Perplexity Pro consumer web app.

---

## Self-Review

- Spec coverage: This plan preserves deterministic classification and manual overrides, improves category-specific fields, keeps Gemini server-only, fails open, validates model output, bounds cost with feature gating and eligibility, adds mocked tests, and leaves Perplexity for a future API-only slot.
- Placeholder scan: The plan avoids placeholder tokens, vague implementation steps, and undefined modules. Every created module has a path, public function names, and representative code.
- Type consistency: `LlmCategoryEnhancement`, `GeminiCategoryResult`, `decideLlmEligibility`, `enhanceCategoryWithGemini`, and `mergeLlmEnrichment` names are consistent across tasks.

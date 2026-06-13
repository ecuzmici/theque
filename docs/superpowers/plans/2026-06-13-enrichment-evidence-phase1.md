# Enrichment Evidence Pipeline — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make enrichment work from real evidence: the Chrome extension sends a rendered-DOM snapshot with each capture, the LLM receives page text and may use tiered world knowledge, output is schema-enforced on the direct Gemini SDK, and eligibility/merge stop discarding useful results.

**Architecture:** A `capture_snapshot` (meta tags + JSON-LD + innerText excerpt) flows from the extension through the capture API into `items.raw_metadata`. Enrichment converts the snapshot into synthetic HTML and reuses the existing `extractFromHtml` pipeline, skipping the server fetch. A unified LLM call (direct `@google/genai` SDK, `gemini-2.5-flash-lite` with `gemini-2.5-flash` fallback) gets a v3 prompt with page text and tiered world-knowledge rules, returns schema-enforced JSON with per-field provenance (`field_sources`), runs even when classification returned `null`, and merges junk-aware.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, JSDOM, `@google/genai` (already a dependency), Chrome MV3 (`chrome.scripting`), Supabase.

**Spec:** `docs/superpowers/specs/2026-06-13-enrichment-evidence-pipeline-design.md`

**Conventions for this plan:**
- Run all commands from the repo root (`c:\Users\emilc\projects\bookmarkly`). Shell is PowerShell — use `;` to chain, never `&&`.
- `npm test` runs the full Vitest suite; `npx vitest run <file>` runs one file.
- Commit after every task. Do not commit `.env.local`.
- Out of scope for phase 1 (later phases): grounded search, Jina Reader, resolver registry, screenshots/multimodal, "needs details" badge.

---

### Task 1: Capture snapshot type + server-side validator

The shared shape for the rendered-DOM snapshot and the hardened parser the capture API uses on untrusted input.

**Files:**
- Create: `src/lib/capture/capture-snapshot.ts`
- Create: `src/lib/capture/capture-snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/capture/capture-snapshot.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { parseCaptureSnapshot } from "@/lib/capture/capture-snapshot";

describe("parseCaptureSnapshot", () => {
  const validInput = {
    captured_at: "2026-06-13T00:00:00.000Z",
    page_title: "The Dark Knight (2008) - IMDb",
    canonical_url: "https://www.imdb.com/title/tt0468569/",
    meta: [
      { attr: "property", key: "og:title", content: "The Dark Knight (2008) ⭐ 9.0" },
      { attr: "name", key: "twitter:card", content: "summary_large_image" },
    ],
    json_ld: ['{"@type":"Movie","name":"The Dark Knight"}'],
    text: "When the menace known as the Joker wreaks havoc on Gotham...",
  };

  it("accepts a well-formed snapshot and preserves fields", () => {
    const parsed = parseCaptureSnapshot(validInput);
    expect(parsed).not.toBeNull();
    expect(parsed?.page_title).toBe("The Dark Knight (2008) - IMDb");
    expect(parsed?.canonical_url).toBe("https://www.imdb.com/title/tt0468569/");
    expect(parsed?.captured_at).toBe("2026-06-13T00:00:00.000Z");
    expect(parsed?.meta).toHaveLength(2);
    expect(parsed?.json_ld).toHaveLength(1);
    expect(parsed?.text).toContain("Joker");
  });

  it("returns null for non-object input", () => {
    expect(parseCaptureSnapshot(null)).toBeNull();
    expect(parseCaptureSnapshot("string")).toBeNull();
    expect(parseCaptureSnapshot([1, 2])).toBeNull();
  });

  it("returns null for an empty snapshot (no title, meta, json_ld, or text)", () => {
    expect(parseCaptureSnapshot({ meta: [], json_ld: [] })).toBeNull();
  });

  it("drops malformed meta entries and invalid JSON-LD blocks", () => {
    const parsed = parseCaptureSnapshot({
      ...validInput,
      meta: [
        { attr: "property", key: "og:title", content: "ok" },
        { attr: "style", key: "evil", content: "nope" },
        { attr: "name", key: "", content: "nope" },
        { attr: "name", key: "x", content: 42 },
      ],
      json_ld: ['{"valid":true}', "not json {{{", 42],
    });
    expect(parsed?.meta).toEqual([{ attr: "property", key: "og:title", content: "ok" }]);
    expect(parsed?.json_ld).toEqual(['{"valid":true}']);
  });

  it("truncates oversized text and rejects non-http canonical URLs", () => {
    const parsed = parseCaptureSnapshot({
      ...validInput,
      canonical_url: "javascript:alert(1)",
      text: "x".repeat(20000),
    });
    expect(parsed?.canonical_url).toBeUndefined();
    expect(parsed?.text).toHaveLength(8192);
  });

  it("returns null when total serialized size exceeds 64KB", () => {
    const parsed = parseCaptureSnapshot({
      ...validInput,
      json_ld: Array.from({ length: 10 }, () => `{"pad":"${"y".repeat(20000)}"}`),
    });
    expect(parsed).toBeNull();
  });

  it("re-stamps captured_at when missing or invalid", () => {
    const parsed = parseCaptureSnapshot({ ...validInput, captured_at: 42 });
    expect(parsed?.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/capture/capture-snapshot.test.ts`
Expected: FAIL — cannot resolve `@/lib/capture/capture-snapshot`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/capture/capture-snapshot.ts`:

```typescript
/**
 * Capture snapshot — rendered-DOM evidence sent by the Chrome extension at
 * save time. The extension sits inside a fully rendered, logged-in,
 * bot-check-passed page, so this is strictly better evidence than a server
 * fetch of the same URL. Stored in items.raw_metadata.capture_snapshot.
 *
 * Input is untrusted (arbitrary page content): every field is shape-checked,
 * size-capped, and JSON-LD blocks must parse before being kept.
 */

export const MAX_SNAPSHOT_JSON_CHARS = 64 * 1024;
const MAX_META_ENTRIES = 150;
const MAX_META_KEY_CHARS = 200;
const MAX_META_CONTENT_CHARS = 2000;
const MAX_JSON_LD_BLOCKS = 10;
const MAX_JSON_LD_CHARS = 30000;
export const MAX_SNAPSHOT_TEXT_CHARS = 8192;
const MAX_TITLE_CHARS = 1000;
const MAX_URL_CHARS = 2048;

export type CaptureSnapshotMeta = {
  attr: "property" | "name";
  key: string;
  content: string;
};

export type CaptureSnapshot = {
  captured_at: string;
  page_title?: string;
  canonical_url?: string;
  meta: CaptureSnapshotMeta[];
  json_ld: string[];
  text?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/**
 * Validate and sanitize an untrusted snapshot payload. Returns null when the
 * payload is malformed, empty, or oversized — callers treat that as "no
 * snapshot" and capture proceeds normally.
 */
export function parseCaptureSnapshot(value: unknown): CaptureSnapshot | null {
  if (!isRecord(value)) return null;

  const meta: CaptureSnapshotMeta[] = [];
  if (Array.isArray(value.meta)) {
    for (const entry of value.meta) {
      if (meta.length >= MAX_META_ENTRIES) break;
      if (!isRecord(entry)) continue;
      const { attr, key, content } = entry;
      if (attr !== "property" && attr !== "name") continue;
      if (typeof key !== "string" || !key.trim() || key.length > MAX_META_KEY_CHARS) continue;
      if (typeof content !== "string" || !content) continue;
      meta.push({ attr, key, content: content.slice(0, MAX_META_CONTENT_CHARS) });
    }
  }

  const json_ld: string[] = [];
  if (Array.isArray(value.json_ld)) {
    for (const block of value.json_ld) {
      if (json_ld.length >= MAX_JSON_LD_BLOCKS) break;
      if (typeof block !== "string" || !block.trim() || block.length > MAX_JSON_LD_CHARS) continue;
      try {
        JSON.parse(block);
      } catch {
        continue;
      }
      json_ld.push(block);
    }
  }

  const snapshot: CaptureSnapshot = {
    captured_at: isValidIsoDate(value.captured_at) ? value.captured_at : new Date().toISOString(),
    page_title:
      typeof value.page_title === "string" && value.page_title.trim()
        ? value.page_title.slice(0, MAX_TITLE_CHARS)
        : undefined,
    canonical_url:
      typeof value.canonical_url === "string" &&
      /^https?:\/\//i.test(value.canonical_url) &&
      value.canonical_url.length <= MAX_URL_CHARS
        ? value.canonical_url
        : undefined,
    meta,
    json_ld,
    text:
      typeof value.text === "string" && value.text.trim()
        ? value.text.slice(0, MAX_SNAPSHOT_TEXT_CHARS)
        : undefined,
  };

  const hasEvidence =
    snapshot.meta.length > 0 || snapshot.json_ld.length > 0 || Boolean(snapshot.text) || Boolean(snapshot.page_title);
  if (!hasEvidence) return null;
  if (JSON.stringify(snapshot).length > MAX_SNAPSHOT_JSON_CHARS) return null;

  return snapshot;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/capture/capture-snapshot.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/capture/capture-snapshot.ts src/lib/capture/capture-snapshot.test.ts
git commit -m "feat: add capture snapshot type and untrusted-input validator"
```

---

### Task 2: Capture API accepts and stores `capture_snapshot`

New captures store the snapshot in `raw_metadata`; duplicate-URL captures with a snapshot upgrade the existing item and re-queue enrichment when it is sparse or failed.

**Files:**
- Modify: `src/lib/types/api.ts` (CaptureRequestBody, ~line 12)
- Modify: `src/app/api/capture/route.ts`
- Test: `src/app/api/capture/route.test.ts`

- [ ] **Step 1: Add failing tests**

In `src/app/api/capture/route.test.ts`, first extend the hoisted `makeItemsTable` helper so the duplicate path can record updates. Replace the existing `makeItemsTable` function inside `vi.hoisted` with:

```typescript
  const updateSpy = vi.fn();

  function makeItemsTable(createdRow: Record<string, unknown>, opts?: { existing?: Record<string, unknown> | null }) {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: opts?.existing !== undefined ? opts.existing : null,
        error: null,
      }),
      insert: insertSpy.mockReturnThis(),
      update: updateSpy.mockImplementation(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
      single: vi.fn().mockResolvedValue({ data: createdRow, error: null }),
    };
  }
```

Add `updateSpy` to the returned object of `vi.hoisted` and reset it in `beforeEach` (`mocks.updateSpy.mockClear();`).

Then add this describe block at the end of the file:

```typescript
describe("POST /api/capture capture_snapshot", () => {
  const snapshot = {
    captured_at: "2026-06-13T00:00:00.000Z",
    page_title: "Product Page",
    meta: [{ attr: "property", key: "og:title", content: "Great Product" }],
    json_ld: [],
    text: "A wonderful product with many features.",
  };

  function baseRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "item-1",
      url: "https://example.com/p/1",
      canonical_url: "https://example.com/p/1",
      domain: "example.com",
      title: null,
      subtitle: null,
      description: null,
      image_url: null,
      category: null,
      category_confidence: null,
      status: "inbox",
      processing_status: "pending",
      source: "chrome_extension",
      note: null,
      raw_metadata: {},
      enrichment_error: null,
      created_at: "2026-06-13T00:00:00.000Z",
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.resetModules();
    mocks.lookupCaptureTokenUser.mockReset();
    mocks.enrichItem.mockReset();
    mocks.afterResults.length = 0;
    mocks.insertSpy.mockReset();
    mocks.updateSpy.mockClear();
    mocks.adminFrom.mockReset();
  });

  it("stores a valid snapshot in raw_metadata on insert", async () => {
    const itemsTable = mocks.makeItemsTable(baseRow());
    mocks.adminFrom.mockImplementation(() => itemsTable);
    mocks.lookupCaptureTokenUser.mockResolvedValue({ userId: "user-1" });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://theque.app/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer bmly_t" },
        body: JSON.stringify({
          url: "https://example.com/p/1",
          source: "chrome_extension",
          capture_snapshot: snapshot,
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        raw_metadata: expect.objectContaining({
          capture_snapshot: expect.objectContaining({ page_title: "Product Page" }),
        }),
      }),
    );
  });

  it("silently drops a malformed snapshot and still creates the item", async () => {
    const itemsTable = mocks.makeItemsTable(baseRow());
    mocks.adminFrom.mockImplementation(() => itemsTable);
    mocks.lookupCaptureTokenUser.mockResolvedValue({ userId: "user-1" });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://theque.app/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer bmly_t" },
        body: JSON.stringify({
          url: "https://example.com/p/2",
          source: "chrome_extension",
          capture_snapshot: "garbage",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const inserted = mocks.insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.raw_metadata).toBeUndefined();
  });

  it("on duplicate URL: stores the snapshot and re-queues a failed item", async () => {
    const existing = baseRow({
      id: "item-existing",
      processing_status: "failed",
      enrichment_error: "fetch_blocked_or_sparse",
      title: null,
    });
    const itemsTable = mocks.makeItemsTable(existing, { existing });
    mocks.adminFrom.mockImplementation(() => itemsTable);
    mocks.lookupCaptureTokenUser.mockResolvedValue({ userId: "user-1" });
    mocks.enrichItem.mockResolvedValue("ready");

    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://theque.app/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer bmly_t" },
        body: JSON.stringify({
          url: "https://example.com/p/1",
          source: "chrome_extension",
          capture_snapshot: snapshot,
        }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ created: false });
    expect(mocks.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        raw_metadata: expect.objectContaining({
          capture_snapshot: expect.objectContaining({ page_title: "Product Page" }),
        }),
        processing_status: "pending",
        enrichment_attempts: 0,
        enrichment_error: null,
      }),
    );
    expect(mocks.enrichItem).toHaveBeenCalledWith("item-existing");
  });

  it("on duplicate URL: stores the snapshot without re-queueing a healthy item", async () => {
    const existing = baseRow({
      id: "item-healthy",
      processing_status: "ready",
      title: "A good descriptive title",
      enrichment_error: null,
    });
    const itemsTable = mocks.makeItemsTable(existing, { existing });
    mocks.adminFrom.mockImplementation(() => itemsTable);
    mocks.lookupCaptureTokenUser.mockResolvedValue({ userId: "user-1" });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://theque.app/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer bmly_t" },
        body: JSON.stringify({
          url: "https://example.com/p/1",
          source: "chrome_extension",
          capture_snapshot: snapshot,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const updateArg = mocks.updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.raw_metadata).toBeDefined();
    expect(updateArg.processing_status).toBeUndefined();
    expect(mocks.enrichItem).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/app/api/capture/route.test.ts`
Expected: existing tests PASS, the four new tests FAIL (no snapshot handling in route).

- [ ] **Step 3: Add the request type**

In `src/lib/types/api.ts`, extend `CaptureRequestBody`:

```typescript
/** POST /api/capture */
export type CaptureRequestBody = {
  url: string;
  note?: string | null;
  category_hint?: ExtensionCategoryHint | null;
  tag_names?: string[];
  collection_ids?: string[];
  source: ItemSource;
  /** Rendered-DOM evidence from the Chrome extension; validated server-side
   * by parseCaptureSnapshot. Malformed/oversized values are dropped silently. */
  capture_snapshot?: unknown;
};
```

- [ ] **Step 4: Wire the route**

In `src/app/api/capture/route.ts`:

Add imports:

```typescript
import { parseCaptureSnapshot } from "@/lib/capture/capture-snapshot";
import { isWeakTitle } from "@/lib/enrichment/meta-utils";
```

After the `collectionIds` validation block (before `let canonical: string;`), parse the snapshot:

```typescript
  const captureSnapshot =
    body.capture_snapshot !== undefined ? parseCaptureSnapshot(body.capture_snapshot) : null;
```

Replace the duplicate-URL branch (`if (existing) { ... }`) with:

```typescript
  if (existing) {
    // A fresh snapshot is better evidence than whatever the original capture
    // had — store it, and re-run enrichment when the item never got good data.
    if (captureSnapshot) {
      const existingRaw =
        existing.raw_metadata &&
        typeof existing.raw_metadata === "object" &&
        !Array.isArray(existing.raw_metadata)
          ? (existing.raw_metadata as Record<string, Json>)
          : {};
      const needsRequeue =
        existing.processing_status === "failed" ||
        existing.enrichment_error !== null ||
        isWeakTitle(existing.title);

      await admin
        .from("items")
        .update({
          raw_metadata: {
            ...existingRaw,
            capture_snapshot: captureSnapshot,
          } as Json,
          ...(needsRequeue
            ? {
                processing_status: "pending" as const,
                enrichment_attempts: 0,
                enrichment_error: null,
              }
            : {}),
        })
        .eq("id", existing.id);

      if (needsRequeue) {
        after(async () => {
          await enrichItem(existing.id);
        });
      }
    }

    const res: CaptureResponseBody = {
      created: false,
      item: mapCaptureItem(existing),
    };
    return jsonResponse(res);
  }
```

In `insertRow`, add the snapshot to `raw_metadata`:

```typescript
  const insertRow = {
    user_id: userId,
    url: body.url.trim(),
    canonical_url: canonical,
    url_fingerprint: fp,
    domain,
    source: body.source,
    note: body.note ?? null,
    status: "inbox" as const,
    processing_status: "pending" as const,
    structured: (categoryHint ? { capture_category_hint: categoryHint } : {}) as Json,
    ...(captureSnapshot
      ? { raw_metadata: { capture_snapshot: captureSnapshot } as Json }
      : {}),
  };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/api/capture/route.test.ts`
Expected: PASS (all, including the pre-existing tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types/api.ts src/app/api/capture/route.ts src/app/api/capture/route.test.ts
git commit -m "feat: capture API stores extension snapshots and re-queues sparse duplicates"
```

---

### Task 3: Extension collects and sends the snapshot

**Files:**
- Create: `extension/page-snapshot.ts`
- Create: `extension/page-snapshot.test.ts`
- Modify: `extension/manifest.json`
- Modify: `extension/popup.ts`

- [ ] **Step 1: Write the failing test**

Create `extension/page-snapshot.test.ts` (note the jsdom pragma — extension tests otherwise run in node):

```typescript
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { collectPageSnapshot } from "./page-snapshot";

describe("collectPageSnapshot", () => {
  it("collects title, meta tags, JSON-LD, and main-content text", () => {
    document.title = "The Dark Knight (2008) - IMDb";
    document.head.innerHTML = `
      <link rel="canonical" href="https://www.imdb.com/title/tt0468569/">
      <meta property="og:title" content="The Dark Knight (2008)">
      <meta name="twitter:card" content="summary_large_image">
      <meta charset="utf-8">
      <script type="application/ld+json">{"@type":"Movie","name":"The Dark Knight"}</script>
    `;
    document.body.innerHTML = `
      <nav>Menu Home About</nav>
      <main><p>When the menace known as the Joker wreaks havoc on Gotham City.</p></main>
    `;

    const snap = collectPageSnapshot();

    expect(snap.page_title).toBe("The Dark Knight (2008) - IMDb");
    expect(snap.canonical_url).toBe("https://www.imdb.com/title/tt0468569/");
    expect(snap.meta).toContainEqual({
      attr: "property",
      key: "og:title",
      content: "The Dark Knight (2008)",
    });
    expect(snap.meta).toContainEqual({
      attr: "name",
      key: "twitter:card",
      content: "summary_large_image",
    });
    expect(snap.json_ld).toEqual(['{"@type":"Movie","name":"The Dark Knight"}']);
    expect(snap.text).toContain("Joker");
    expect(snap.text).not.toContain("Menu Home About");
    expect(snap.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("falls back to body text when no main/article exists and caps length", () => {
    document.head.innerHTML = "";
    document.body.innerHTML = `<div>${"word ".repeat(5000)}</div>`;

    const snap = collectPageSnapshot();

    expect(snap.text).toBeDefined();
    expect((snap.text ?? "").length).toBeLessThanOrEqual(8192);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run extension/page-snapshot.test.ts`
Expected: FAIL — `./page-snapshot` does not exist.

- [ ] **Step 3: Write the snapshot collector**

Create `extension/page-snapshot.ts`. IMPORTANT: `collectPageSnapshot` is injected into pages via `chrome.scripting.executeScript({ func })`, which serializes the function — it must be fully self-contained (no imports, no outer-scope references, all constants inside the body):

```typescript
export type SnapshotMetaEntry = { attr: "property" | "name"; key: string; content: string };

export type PageSnapshot = {
  captured_at: string;
  page_title?: string;
  canonical_url?: string;
  meta: SnapshotMetaEntry[];
  json_ld: string[];
  text?: string;
};

/**
 * Collect rendered-DOM evidence from the current page. Injected via
 * chrome.scripting.executeScript({ func }), so it MUST be self-contained:
 * no imports, no references to anything outside the function body.
 */
export function collectPageSnapshot(): PageSnapshot {
  const MAX_META = 150;
  const MAX_META_CONTENT = 2000;
  const MAX_JSON_LD_BLOCKS = 10;
  const MAX_JSON_LD_CHARS = 30000;
  const MAX_TEXT_CHARS = 8192;

  const meta: Array<{ attr: "property" | "name"; key: string; content: string }> = [];
  document.querySelectorAll("meta[property], meta[name]").forEach((el) => {
    if (meta.length >= MAX_META) return;
    const content = el.getAttribute("content");
    if (!content) return;
    const property = el.getAttribute("property");
    const name = el.getAttribute("name");
    if (property) {
      meta.push({ attr: "property", key: property, content: content.slice(0, MAX_META_CONTENT) });
    } else if (name) {
      meta.push({ attr: "name", key: name, content: content.slice(0, MAX_META_CONTENT) });
    }
  });

  const json_ld: string[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    if (json_ld.length >= MAX_JSON_LD_BLOCKS) return;
    const text = el.textContent?.trim();
    if (text && text.length <= MAX_JSON_LD_CHARS) json_ld.push(text);
  });

  // Prefer semantic main content; strip obvious chrome by cloning and
  // removing nav/header/footer/aside before reading text.
  const mainEl = document.querySelector("main") ?? document.querySelector("article");
  let textRoot: HTMLElement | null = mainEl as HTMLElement | null;
  if (!textRoot && document.body) {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll("nav, header, footer, aside, script, style, noscript, iframe, svg")
      .forEach((el) => el.remove());
    textRoot = clone;
  }
  // innerText reflects rendering; cloned/detached nodes and test DOMs fall
  // back to textContent.
  const rawText = textRoot ? (textRoot.innerText ?? textRoot.textContent ?? "") : "";
  const text = rawText.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS) || undefined;

  const canonical =
    document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? undefined;

  return {
    captured_at: new Date().toISOString(),
    page_title: document.title || undefined,
    canonical_url: canonical && /^https?:\/\//i.test(canonical) ? canonical : undefined,
    meta,
    json_ld,
    text,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run extension/page-snapshot.test.ts`
Expected: PASS (2 tests). Note: jsdom's `main` query on a clone — if the first test fails on nav text leaking in, the `<main>` branch is not being hit; check that `document.querySelector("main")` finds the element.

- [ ] **Step 5: Add the scripting permission**

In `extension/manifest.json`, change the permissions line and bump the version (Chrome Web Store requires a version bump to submit; `scripting` + existing `activeTab` adds no new user-facing permission warning):

```json
  "version": "0.3.0",
  ...
  "permissions": ["storage", "activeTab", "scripting"],
```

- [ ] **Step 6: Wire the popup**

In `extension/popup.ts`:

Add the import at the top (note `.js` — extension imports are compiled-output relative):

```typescript
import { collectPageSnapshot, type PageSnapshot } from "./page-snapshot.js";
```

Change `getActiveTab` to also return the tab id:

```typescript
async function getActiveTab(): Promise<{ id: number | undefined; url: string; title: string } | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url;
  if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    return null;
  }
  return { id: tab.id, url, title: tab.title?.trim() || "Current tab" };
}
```

In the save handler, after the `const tab = await getActiveTab();` null-check and before building the POST body, collect the snapshot (failure is non-fatal — restricted pages and PDF viewers reject injection):

```typescript
      let captureSnapshot: PageSnapshot | null = null;
      if (typeof tab.id === "number") {
        try {
          const [injection] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: collectPageSnapshot,
          });
          captureSnapshot = (injection?.result as PageSnapshot | undefined) ?? null;
        } catch {
          captureSnapshot = null;
        }
      }
```

And include it in the POST body:

```typescript
        body: JSON.stringify({
          url: tab.url,
          ...(note ? { note } : {}),
          ...(categoryHint ? { category_hint: categoryHint } : {}),
          ...(captureSnapshot ? { capture_snapshot: captureSnapshot } : {}),
          source: "chrome_extension",
        }),
```

- [ ] **Step 7: Build and run all extension tests**

Run: `npm run build:extension; npx vitest run extension/`
Expected: tsc compiles `page-snapshot.ts` → `page-snapshot.js`; all extension tests PASS. If `popup.test.ts` fails because its chrome mock lacks `chrome.scripting`, add to the mock object: `scripting: { executeScript: vi.fn().mockResolvedValue([{ result: null }]) }` — a null result means "no snapshot", which preserves the old request-body expectations.

- [ ] **Step 8: Commit**

```bash
git add extension/page-snapshot.ts extension/page-snapshot.test.ts extension/page-snapshot.js extension/manifest.json extension/popup.ts extension/popup.js extension/popup.test.ts
git commit -m "feat: extension captures rendered-DOM snapshot and sends it with capture POST"
```

(Check `git status` first: if compiled `.js` files are gitignored, drop them from the add list.)

---

### Task 4: Page-text extraction

**Files:**
- Create: `src/lib/enrichment/page-text.ts`
- Create: `src/lib/enrichment/page-text.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/enrichment/page-text.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { extractPageText } from "@/lib/enrichment/page-text";

describe("extractPageText", () => {
  it("prefers main content and strips nav/script/style noise", () => {
    const html = `<!DOCTYPE html><html><head>
      <style>.x { color: red; }</style>
      <script>var tracking = true;</script>
    </head><body>
      <nav>Home About Contact</nav>
      <main><h1>Slow-Cooked Ragu</h1><p>Ingredients: 500g beef, 2 onions, garlic.</p></main>
      <footer>Copyright 2026</footer>
    </body></html>`;

    const text = extractPageText(html);

    expect(text).toContain("Slow-Cooked Ragu");
    expect(text).toContain("500g beef");
    expect(text).not.toContain("Home About Contact");
    expect(text).not.toContain("Copyright 2026");
    expect(text).not.toContain("tracking");
  });

  it("falls back to body when no main/article exists", () => {
    const html = "<html><body><div><p>Just a plain page about a restaurant in Lisbon.</p></div></body></html>";
    expect(extractPageText(html)).toContain("restaurant in Lisbon");
  });

  it("caps output at 4000 characters", () => {
    const html = `<html><body><main>${"verylongword ".repeat(2000)}</main></body></html>`;
    expect(extractPageText(html)?.length).toBeLessThanOrEqual(4000);
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(extractPageText("")).toBeNull();
    expect(extractPageText("<html><body><main>   </main></body></html>")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/enrichment/page-text.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/enrichment/page-text.ts`:

```typescript
import { JSDOM, VirtualConsole } from "jsdom";

/** Cap chosen so page text adds ~1k tokens to the enrichment prompt. */
export const MAX_PAGE_TEXT_CHARS = 4000;

const NOISE_SELECTOR = "script, style, noscript, iframe, svg, nav, header, footer, aside";

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", () => {
  /* JSDOM may log CSS parse errors on large pages; extraction still proceeds */
});

/**
 * Extract readable main-content text from an HTML document for LLM prompts.
 * Returns null when there is no usable text.
 */
export function extractPageText(html: string): string | null {
  if (!html.trim()) return null;
  const dom = new JSDOM(html, { virtualConsole });
  const doc = dom.window.document;
  doc.querySelectorAll(NOISE_SELECTOR).forEach((el) => el.remove());
  const root = doc.querySelector("main") ?? doc.querySelector("article") ?? doc.body;
  const text = root?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return null;
  return text.slice(0, MAX_PAGE_TEXT_CHARS);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/enrichment/page-text.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/page-text.ts src/lib/enrichment/page-text.test.ts
git commit -m "feat: add main-content page-text extraction for LLM prompts"
```

---

### Task 5: Snapshot → synthetic HTML adapter

Converts a stored snapshot into a fetch-result-shaped object so `extractFromHtml` and every existing parser run unchanged on snapshot evidence.

**Files:**
- Create: `src/lib/enrichment/snapshot-adapter.ts`
- Create: `src/lib/enrichment/snapshot-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/enrichment/snapshot-adapter.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import type { CaptureSnapshot } from "@/lib/capture/capture-snapshot";
import { extractFromHtml } from "@/lib/enrichment/extract";
import { readCaptureSnapshot, snapshotToFetchResult } from "@/lib/enrichment/snapshot-adapter";

const movieSnapshot: CaptureSnapshot = {
  captured_at: "2026-06-13T00:00:00.000Z",
  page_title: "The Dark Knight (2008) - IMDb",
  canonical_url: "https://www.imdb.com/title/tt0468569/",
  meta: [
    { attr: "property", key: "og:title", content: "The Dark Knight (2008) ⭐ 9.0" },
    { attr: "property", key: "og:image", content: "https://m.media-amazon.com/poster.jpg" },
    { attr: "property", key: "og:description", content: "Batman faces the Joker." },
  ],
  json_ld: [
    '{"@context":"https://schema.org","@type":"Movie","name":"The Dark Knight","datePublished":"2008-07-18","director":{"@type":"Person","name":"Christopher Nolan"}}',
  ],
  text: "When the menace known as the Joker wreaks havoc on Gotham City...",
};

describe("snapshotToFetchResult", () => {
  it("produces HTML that the existing extract pipeline can parse", () => {
    const result = snapshotToFetchResult(movieSnapshot, "https://imdb.com/title/tt0468569/");

    expect(result.statusCode).toBe(200);
    expect(result.finalUrl).toBe("https://www.imdb.com/title/tt0468569/");

    const extracted = extractFromHtml(result.html, {
      finalUrl: result.finalUrl,
      statusCode: result.statusCode,
    });
    expect(extracted.raw_metadata.open_graph["og:image"]).toBe(
      "https://m.media-amazon.com/poster.jpg",
    );
    expect(extracted.raw_metadata.parser).toBe("imdb");
    expect(extracted.structured.year).toBe(2008);
    expect(extracted.structured.directors).toEqual(["Christopher Nolan"]);
  });

  it("falls back to the item canonical URL when the snapshot has none", () => {
    const result = snapshotToFetchResult(
      { ...movieSnapshot, canonical_url: undefined },
      "https://example.com/fallback",
    );
    expect(result.finalUrl).toBe("https://example.com/fallback");
  });

  it("escapes meta content and neutralizes </script> inside JSON-LD", () => {
    const hostile: CaptureSnapshot = {
      captured_at: "2026-06-13T00:00:00.000Z",
      page_title: 'Evil "Page" <script>',
      meta: [{ attr: "property", key: "og:title", content: '"><script>alert(1)</script>' }],
      json_ld: ['{"name":"</script><script>alert(1)</script>"}'],
    };
    const result = snapshotToFetchResult(hostile, "https://example.com/x");

    // Synthetic HTML must contain no executable script element.
    expect(result.html).not.toMatch(/<script>(?!.*ld\+json)/);
    const extracted = extractFromHtml(result.html, {
      finalUrl: "https://example.com/x",
      statusCode: 200,
    });
    expect(extracted.raw_metadata.open_graph["og:title"]).toBe('"><script>alert(1)</script>');
  });

  it("drops JSON-LD blocks that no longer parse", () => {
    const result = snapshotToFetchResult(
      { ...movieSnapshot, json_ld: ["{{{not json"] },
      "https://example.com/x",
    );
    expect(result.html).not.toContain("ld+json");
  });
});

describe("readCaptureSnapshot", () => {
  it("reads a snapshot out of items.raw_metadata", () => {
    const raw = { fetched_at: "x", capture_snapshot: movieSnapshot };
    const snap = readCaptureSnapshot(raw);
    expect(snap?.page_title).toBe("The Dark Knight (2008) - IMDb");
  });

  it("returns null when raw_metadata has no snapshot or is not an object", () => {
    expect(readCaptureSnapshot(null)).toBeNull();
    expect(readCaptureSnapshot({ open_graph: {} })).toBeNull();
    expect(readCaptureSnapshot("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/enrichment/snapshot-adapter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/enrichment/snapshot-adapter.ts`:

```typescript
import { parseCaptureSnapshot, type CaptureSnapshot } from "@/lib/capture/capture-snapshot";

export type SnapshotFetchResult = {
  html: string;
  finalUrl: string;
  statusCode: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Re-serialize JSON-LD so a literal `</script>` inside string values cannot
 * terminate the synthetic script element. Returns null for invalid JSON. */
function safeJsonLd(block: string): string | null {
  try {
    return JSON.stringify(JSON.parse(block)).replace(/</g, "\\u003c");
  } catch {
    return null;
  }
}

/**
 * Rebuild a minimal HTML document from a capture snapshot so the existing
 * extractFromHtml pipeline (OG/Twitter/JSON-LD readers + site parsers) runs
 * unchanged on extension-provided evidence. Body text is intentionally left
 * out — it travels separately as pageText for the LLM prompt.
 */
export function snapshotToFetchResult(
  snapshot: CaptureSnapshot,
  canonicalUrl: string,
): SnapshotFetchResult {
  const parts: string[] = ["<!DOCTYPE html><html><head>"];
  if (snapshot.page_title) {
    parts.push(`<title>${escapeHtml(snapshot.page_title)}</title>`);
  }
  for (const entry of snapshot.meta) {
    parts.push(
      `<meta ${entry.attr}="${escapeHtml(entry.key)}" content="${escapeHtml(entry.content)}">`,
    );
  }
  for (const block of snapshot.json_ld) {
    const safe = safeJsonLd(block);
    if (safe) parts.push(`<script type="application/ld+json">${safe}</script>`);
  }
  parts.push("</head><body></body></html>");

  return {
    html: parts.join(""),
    finalUrl: snapshot.canonical_url ?? canonicalUrl,
    statusCode: 200,
  };
}

/** Pull a validated snapshot out of items.raw_metadata, or null. */
export function readCaptureSnapshot(rawMetadata: unknown): CaptureSnapshot | null {
  if (!rawMetadata || typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) return null;
  const candidate = (rawMetadata as Record<string, unknown>).capture_snapshot;
  if (candidate === undefined) return null;
  return parseCaptureSnapshot(candidate);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/enrichment/snapshot-adapter.test.ts`
Expected: PASS (6 tests). The IMDb assertion exercises the real `parseImdb` path — if `structured.year` fails, check that the synthetic HTML's `finalUrl` host is `www.imdb.com` so the IMDb parser is selected.

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/snapshot-adapter.ts src/lib/enrichment/snapshot-adapter.test.ts
git commit -m "feat: convert capture snapshots to synthetic HTML for the extract pipeline"
```

---

### Task 6: Junk-description detection

**Files:**
- Modify: `src/lib/enrichment/meta-utils.ts`
- Test: existing patterns — create `src/lib/enrichment/meta-utils.test.ts` if absent; the function is consumed by Task 9's merge.

- [ ] **Step 1: Write the failing test**

Check whether `src/lib/enrichment/meta-utils.test.ts` exists. If yes, append the describe block; if no, create the file:

```typescript
import { describe, expect, it } from "vitest";

import { isJunkDescription } from "@/lib/enrichment/meta-utils";

describe("isJunkDescription", () => {
  it("treats empty/short descriptions as junk", () => {
    expect(isJunkDescription(null)).toBe(true);
    expect(isJunkDescription("")).toBe(true);
    expect(isJunkDescription("Too short.")).toBe(true);
  });

  it("treats error and bot-wall text as junk", () => {
    expect(isJunkDescription("Access Denied - you do not have permission to view this page.")).toBe(true);
    expect(isJunkDescription("Please enable JavaScript and complete the captcha to continue to site.")).toBe(true);
    expect(isJunkDescription("404 Not Found: the page you requested does not exist on the server.")).toBe(true);
  });

  it("accepts a real description", () => {
    expect(
      isJunkDescription("Batman raises the stakes in his war on crime with the help of Lt. Jim Gordon."),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/enrichment/meta-utils.test.ts`
Expected: FAIL — `isJunkDescription` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/enrichment/meta-utils.ts`, add after `isWeakTitle`:

```typescript
const BLOCK_TEXT_RE =
  /\b(access denied|robot check|are you a robot|are you a human|enable javascript|captcha|verify you are|unusual traffic)\b/i;

/**
 * A description that should not block an LLM replacement: missing, too short
 * to be useful, or error/bot-wall boilerplate that leaked into metadata.
 */
export function isJunkDescription(description: string | null | undefined): boolean {
  if (!description?.trim()) return true;
  const d = description.trim();
  if (d.length < 30) return true;
  return isErrorPageTitle(d) || BLOCK_TEXT_RE.test(d);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/enrichment/meta-utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/meta-utils.ts src/lib/enrichment/meta-utils.test.ts
git commit -m "feat: add junk-description detection for merge replacement decisions"
```

---

### Task 7: Validator + response schema support `field_sources` and nullable category

**Files:**
- Modify: `src/lib/enrichment/llm/category-schemas.ts`
- Test: `src/lib/enrichment/llm/category-schemas.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/enrichment/llm/category-schemas.test.ts`:

```typescript
describe("validateLlmCategoryEnhancement field_sources and null category", () => {
  it("accepts valid field_sources values", () => {
    const result = validateLlmCategoryEnhancement("books", {
      confidence: 0.6,
      sources: ["model_knowledge"],
      structured: { authors: ["Frank Herbert"], published_year: 1965 },
      field_sources: { authors: "model_knowledge", published_year: "page" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.field_sources).toEqual({
        authors: "model_knowledge",
        published_year: "page",
      });
    }
  });

  it("rejects unknown field_sources values", () => {
    const result = validateLlmCategoryEnhancement("books", {
      confidence: 0.6,
      sources: ["url"],
      field_sources: { authors: "telepathy" },
    });
    expect(result).toEqual({ ok: false, reason: "invalid_field_sources" });
  });

  it("validates structured against the suggestion when category is null", () => {
    const result = validateLlmCategoryEnhancement(null, {
      confidence: 0.5,
      sources: ["url"],
      category_suggestion: "restaurants",
      category_confidence: 0.7,
      structured: { place_name: "Selva" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects structured fields when category is null and no suggestion is given", () => {
    const result = validateLlmCategoryEnhancement(null, {
      confidence: 0.5,
      sources: ["url"],
      structured: { place_name: "Selva" },
    });
    expect(result).toEqual({ ok: false, reason: "structured_without_category" });
  });
});
```

(Use the same import style as the top of the existing test file.)

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/lib/enrichment/llm/category-schemas.test.ts`
Expected: new tests FAIL (TypeScript: argument of type `null` not assignable; `field_sources` unknown).

- [ ] **Step 3: Implement**

In `src/lib/enrichment/llm/category-schemas.ts`:

Add the provenance type and extend `LlmCategoryEnhancement`:

```typescript
export const FIELD_SOURCE_VALUES = ["page", "model_knowledge", "grounded_search"] as const;
export type FieldSource = (typeof FIELD_SOURCE_VALUES)[number];

export type LlmCategoryEnhancement = {
  category_suggestion?: ItemCategory;
  category_confidence?: number;
  title?: string;
  subtitle?: string;
  description?: string;
  image_url?: string;
  structured?: Record<string, unknown>;
  /** Per-structured-field provenance, e.g. { authors: "model_knowledge" }. */
  field_sources?: Record<string, FieldSource>;
  confidence: number;
  sources: string[];
  notes?: string;
};
```

Change the `validateLlmCategoryEnhancement` signature to accept `null` and add the two validations. Replace the function header and the `structured` block:

```typescript
const validFieldSources = new Set<string>(FIELD_SOURCE_VALUES);

export function validateLlmCategoryEnhancement(
  category: ItemCategory | null,
  value: unknown,
): LlmValidationResult {
```

…and inside, replace the existing `structured` validation block with:

```typescript
  const structured = value.structured;
  if (structured !== undefined) {
    if (!isRecord(structured)) return { ok: false, reason: "invalid_structured" };
    const structuredCategory = allowedCategories.has(categorySuggestion as ItemCategory)
      ? (categorySuggestion as ItemCategory)
      : category;
    if (structuredCategory === null) {
      if (Object.keys(structured).length > 0) {
        return { ok: false, reason: "structured_without_category" };
      }
    } else {
      const allowed = allowedStructuredFields[structuredCategory];
      const validators = fieldValidators[structuredCategory];
      for (const [key, fieldValue] of Object.entries(structured)) {
        if (!allowed.has(key)) return { ok: false, reason: `unknown_structured_field:${key}` };
        if (!validators[key]?.(fieldValue)) return { ok: false, reason: `invalid_structured_field:${key}` };
      }
    }
  }

  let fieldSources: Record<string, FieldSource> | undefined;
  const rawFieldSources = value.field_sources;
  if (rawFieldSources !== undefined) {
    if (!isRecord(rawFieldSources)) return { ok: false, reason: "invalid_field_sources" };
    fieldSources = {};
    for (const [key, source] of Object.entries(rawFieldSources)) {
      if (typeof source !== "string" || !validFieldSources.has(source)) {
        return { ok: false, reason: "invalid_field_sources" };
      }
      fieldSources[key] = source as FieldSource;
    }
  }
```

…and add `field_sources: fieldSources,` to the returned `value` object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/enrichment/llm/category-schemas.test.ts`
Expected: PASS (existing + new). Existing callers pass a non-null category, so widening the parameter breaks nothing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/llm/category-schemas.ts src/lib/enrichment/llm/category-schemas.test.ts
git commit -m "feat: validate field_sources provenance and null-category enhancements"
```

---

### Task 8: Prompt v3 — page text, tiered world knowledge, uncategorized support

**Files:**
- Modify: `src/lib/enrichment/llm/prompt-builder.ts`
- Test: `src/lib/enrichment/llm/prompt-builder.test.ts`

The existing `buildGeminiCategoryPromptV2` stays exported and untouched (the eval script `scripts/eval-gemini-prompt.ts` imports it), except its parameter is narrowed to keep compiling after Task 9 widens `GeminiCategoryInput`.

- [ ] **Step 1: Add failing tests**

Append to `src/lib/enrichment/llm/prompt-builder.test.ts` (match the existing import style; import `buildGeminiCategoryPromptV3` from the same module):

```typescript
describe("buildGeminiCategoryPromptV3", () => {
  const baseInput = {
    finalUrl: "https://www.imdb.com/title/tt0468569/",
    category: "movies_and_tv" as const,
    categorySuggestionAllowed: false,
    title: "The Dark Knight (2008) - IMDb",
    subtitle: null,
    description: null,
    image_url: null,
    structured: {},
    rawMetadata: {
      fetched_at: "2026-06-13T00:00:00.000Z",
      final_url: "https://www.imdb.com/title/tt0468569/",
      status_code: 200,
      open_graph: {},
      twitter: {},
      json_ld: [],
      parser: "imdb",
    },
    pageText: "When the menace known as the Joker wreaks havoc...",
  };

  it("includes page text when provided", () => {
    const prompt = buildGeminiCategoryPromptV3(baseInput);
    expect(prompt).toContain("## Page text");
    expect(prompt).toContain("Joker wreaks havoc");
  });

  it("omits the page-text section when null", () => {
    const prompt = buildGeminiCategoryPromptV3({ ...baseInput, pageText: null });
    expect(prompt).not.toContain("## Page text");
  });

  it("contains tiered world-knowledge rules and provenance instructions", () => {
    const prompt = buildGeminiCategoryPromptV3(baseInput);
    expect(prompt).toContain("model_knowledge");
    expect(prompt).toContain("field_sources");
    expect(prompt).toMatch(/never .*(prices|volatile)/i);
  });

  it("requires a category suggestion when category is null", () => {
    const prompt = buildGeminiCategoryPromptV3({
      ...baseInput,
      category: null,
      categorySuggestionAllowed: true,
      categorySuggestionReason: "uncategorized",
    });
    expect(prompt).toContain("No reliable category was determined");
    expect(prompt).toContain("category_suggestion");
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/lib/enrichment/llm/prompt-builder.test.ts`
Expected: new tests FAIL (`buildGeminiCategoryPromptV3` is not exported).

- [ ] **Step 3: Implement**

In `src/lib/enrichment/llm/prompt-builder.ts`:

Narrow v2's parameter so it keeps compiling after `GeminiCategoryInput.category` becomes nullable in Task 9:

```typescript
export function buildGeminiCategoryPromptV2(
  input: GeminiCategoryInput & { category: ItemCategory },
): string {
```

Add the v3 labels and builder at the end of the file:

```typescript
// ── V3: page text + tiered world knowledge + provenance ─────────

export const VALID_SOURCE_LABELS_V3 = [
  ...VALID_SOURCE_LABELS,
  "page_text",
  "model_knowledge",
] as const;

export function buildGeminiCategoryPromptV3(input: GeminiCategoryInput): string {
  const sections: string[] = [];

  sections.push(
    "You are enriching metadata for a single saved item in Theque, a private visual bookmark library.",
    "Your job: improve the item's title, description, and structured fields using the evidence below, plus carefully-bounded world knowledge.",
  );

  sections.push(
    "",
    "## Error-page guard",
    'If the title, description, or OG metadata contains error indicators (e.g. "404", "Not Found", "Access Denied", "Page Not Available", "Forbidden", "Bot or Not"), treat those fields as ABSENT — do not copy them into your output.',
  );

  sections.push(
    "",
    "## Evidence tiers",
    '- Tier 1 — page evidence: values explicitly present in the URL, page text, Open Graph tags, Twitter card, JSON-LD, or the deterministic structured fields below. Always preferred. Label these fields "page" in field_sources.',
    "- Tier 2 — world knowledge: ONLY when the item is unambiguously identified (a canonical ID in the URL such as an IMDb title ID or Goodreads book ID, or an exact title plus creator in the evidence), you MAY fill widely-known, stable facts about that specific work, venue, or product: authors, directors, publication/release year, genres, page counts, cuisine type, media type. Label every such field \"model_knowledge\" in field_sources and include \"model_knowledge\" in sources.",
    "- NEVER use world knowledge for volatile or unverifiable facts: prices, current ratings, ratings counts, availability, addresses, phone numbers, opening hours. These require page evidence. Omit them otherwise.",
    "- If you are not certain the identified entity matches this exact URL, do not use world knowledge. Omit instead.",
    '- URL path segments are valid page evidence for item names, venue names, and destinations (e.g. "/selva-restaurant/" → place_name: "Selva").',
    "- Prefer structured metadata (JSON-LD > Open Graph > Twitter > page text > title tag) when sources conflict.",
  );

  sections.push("", "## Category");
  if (input.category === null) {
    sections.push(
      "No reliable category was determined for this item.",
      "You MUST return category_suggestion (your best category from the list below) and category_confidence.",
      "All structured fields MUST match the suggested category's schema.",
    );
  } else {
    sections.push(`Deterministic category: **${input.category}**`);
    if (input.categorySuggestionAllowed) {
      sections.push(
        `Category suggestion is allowed (reason: ${input.categorySuggestionReason ?? "weak_evidence"}).`,
        'You MAY return category_suggestion + category_confidence ONLY if the evidence clearly identifies the item as a different category. The bar is high: a recipe page on a food blog is "recipes", not "articles"; an Amazon book listing is "books", not "products". Classify the SPECIFIC ITEM the user saved, not the website\'s general genre.',
        "When you return a category_suggestion, all structured fields MUST match the SUGGESTED category's schema below.",
        "If evidence is ambiguous, keep the deterministic category and do NOT return category_suggestion.",
      );
    } else {
      sections.push(
        "Do NOT change the category. Do NOT return category_suggestion or category_confidence.",
        `Return only structured fields allowed for: ${input.category}.`,
      );
    }
  }

  sections.push("", "## Category meanings");
  for (const cat of allCategories) {
    sections.push(`- ${cat}: ${categoryMeanings[cat]}`);
  }

  sections.push(
    "",
    "## Allowed structured fields",
    "Return ONLY fields from the schema for the active category. Any unlisted field will be rejected by the validator.",
  );
  if (input.category === null || input.categorySuggestionAllowed) {
    for (const cat of allCategories) {
      sections.push(formatCategorySchema(cat));
    }
  } else {
    sections.push(formatCategorySchema(input.category));
  }

  sections.push(
    "",
    "## Field rules",
    '- title: The item\'s specific name. Discard site names, error text, and domain-only titles. For restaurants, use the venue name. For products, use the product name (strip "Amazon.com:" prefixes).',
    "- subtitle: Author/director + year for books/movies. Cuisine + location for restaurants. Brand for products. Omit if not evident.",
    "- description: 1–2 sentence summary of the SPECIFIC item, not the website. World knowledge MAY be used here when the entity is Tier-2 identified.",
    "- image_url: Keep the existing image URL if valid (starts with http). Do not invent image URLs.",
    "- structured: Only fields from the schema above, each backed by page evidence or Tier-2 world knowledge.",
    '- field_sources: For EVERY key you return in structured, record where it came from: "page" or "model_knowledge". Example: {"authors": "model_knowledge", "published_year": "page"}.',
    "- confidence: 0.0–1.0. Cap at 0.7 when your output relies mainly on world knowledge. 0.3 = sparse/mostly URL-derived. 0.8+ = rich page evidence.",
    `- sources: Array of evidence source LABELS you actually used. Valid values: ${VALID_SOURCE_LABELS_V3.map((s) => `"${s}"`).join(", ")}. Do NOT use raw URLs.`,
    '- notes: A single string with per-field provenance notes, e.g. "title from og:title; year from model knowledge (IMDb ID identified); price omitted (volatile, no page evidence)".',
  );

  if (input.pageText) {
    sections.push("", "## Page text", input.pageText);
  }

  sections.push(
    "",
    "## Supplied metadata",
    `URL: ${input.finalUrl}`,
    `Title: ${input.title ?? "(none)"}`,
    `Subtitle: ${input.subtitle ?? "(none)"}`,
    `Description: ${input.description ?? "(none)"}`,
    `Image URL: ${input.image_url ?? "(none)"}`,
    `Existing structured: ${JSON.stringify(input.structured)}`,
    `Open Graph: ${JSON.stringify(input.rawMetadata.open_graph)}`,
    `Twitter card: ${JSON.stringify(input.rawMetadata.twitter)}`,
    `JSON-LD: ${JSON.stringify(input.rawMetadata.json_ld)}`,
    `Parser used: ${input.rawMetadata.parser}`,
  );

  return sections.join("\n");
}
```

Note: this file compiles against the widened `GeminiCategoryInput` (nullable `category`, added `pageText`) introduced in Task 9. Until Task 9 lands, temporarily type the v3 input inline if needed — or simply implement Tasks 8 and 9 in one branch-local sequence and run the type check at the end of Task 9.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/enrichment/llm/prompt-builder.test.ts`
Expected: PASS after Task 9's type change; if running Task 8 standalone, the `pageText`/null-category fields will be type errors until Task 9. Complete Task 9, then re-run.

- [ ] **Step 5: Commit** (may be combined with Task 9's commit if types force it)

```bash
git add src/lib/enrichment/llm/prompt-builder.ts src/lib/enrichment/llm/prompt-builder.test.ts
git commit -m "feat: add v3 enrichment prompt with page text and tiered world knowledge"
```

---

### Task 9: Unified enhancer on the direct Gemini SDK

**Files:**
- Modify: `src/lib/enrichment/llm/gemini-category-enhancer.ts` (full rewrite of the transport; keep exports used elsewhere)
- Test: `src/lib/enrichment/llm/gemini-category-enhancer.test.ts`

- [ ] **Step 1: Update the test file**

Replace gateway-oriented tests in `src/lib/enrichment/llm/gemini-category-enhancer.test.ts` with SDK-oriented ones. The shape:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
}));

import {
  buildGeminiResponseJsonSchema,
  enhanceCategoryWithGemini,
  isGeminiConfigured,
  normalizeGeminiPayload,
} from "@/lib/enrichment/llm/gemini-category-enhancer";

const baseInput = {
  finalUrl: "https://www.imdb.com/title/tt0468569/",
  category: "movies_and_tv" as const,
  categorySuggestionAllowed: false,
  title: "The Dark Knight",
  subtitle: null,
  description: null,
  image_url: null,
  structured: {},
  rawMetadata: {
    fetched_at: "2026-06-13T00:00:00.000Z",
    final_url: "https://www.imdb.com/title/tt0468569/",
    status_code: 200,
    open_graph: {},
    twitter: {},
    json_ld: [],
    parser: "imdb",
  },
  pageText: "Batman faces the Joker in Gotham.",
};

describe("enhanceCategoryWithGemini (direct SDK)", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips when GEMINI_API_KEY is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const result = await enhanceCategoryWithGemini(baseInput);
    expect(result).toEqual({ status: "skipped", reason: "missing_api_key" });
    expect(isGeminiConfigured()).toBe(false);
  });

  it("returns enhanced output from the primary model", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        confidence: 0.8,
        sources: ["json_ld"],
        structured: { year: 2008, directors: ["Christopher Nolan"] },
        field_sources: { year: "page", directors: "model_knowledge" },
      }),
    });

    const result = await enhanceCategoryWithGemini(baseInput);

    expect(result.status).toBe("enhanced");
    if (result.status === "enhanced") {
      expect(result.enhancement.structured).toEqual({
        year: 2008,
        directors: ["Christopher Nolan"],
      });
      expect(result.providerMetadata.model).toBe("gemini-2.5-flash-lite");
    }
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    const callArg = generateContentMock.mock.calls[0][0];
    expect(callArg.model).toBe("gemini-2.5-flash-lite");
    expect(callArg.config.responseMimeType).toBe("application/json");
    expect(callArg.config.responseJsonSchema).toBeDefined();
    expect(callArg.contents).toContain("Batman faces the Joker");
  });

  it("falls back to the second model when the first call throws", async () => {
    generateContentMock
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({
        text: JSON.stringify({ confidence: 0.5, sources: ["url"] }),
      });

    const result = await enhanceCategoryWithGemini(baseInput);

    expect(result.status).toBe("enhanced");
    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(generateContentMock.mock.calls[1][0].model).toBe("gemini-2.5-flash");
  });

  it("fails when all models fail", async () => {
    generateContentMock.mockRejectedValue(new Error("boom"));
    const result = await enhanceCategoryWithGemini(baseInput);
    expect(result).toEqual({ status: "failed", reason: "boom" });
  });
});

describe("buildGeminiResponseJsonSchema", () => {
  it("requires category_suggestion when category is null", () => {
    const schema = buildGeminiResponseJsonSchema(true, null) as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.required).toContain("category_suggestion");
    expect(schema.properties.field_sources).toBeDefined();
  });

  it("omits suggestion keys when not allowed", () => {
    const schema = buildGeminiResponseJsonSchema(false, "books") as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties.category_suggestion).toBeUndefined();
  });
});

describe("normalizeGeminiPayload", () => {
  it("rejects invalid payloads with a reason", () => {
    expect(normalizeGeminiPayload("books", { confidence: 2, sources: [] })).toEqual({
      status: "failed",
      reason: "invalid_confidence",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/enrichment/llm/gemini-category-enhancer.test.ts`
Expected: FAIL — `isGeminiConfigured` not exported; transport still gateway-based.

- [ ] **Step 3: Rewrite the module**

Replace the contents of `src/lib/enrichment/llm/gemini-category-enhancer.ts` with:

```typescript
import "server-only";

import type { ItemCategory } from "@/lib/database.types";
import type { RawMetadata } from "@/lib/enrichment/extract";
import {
  FIELD_SOURCE_VALUES,
  type LlmCategoryEnhancement,
  buildStructuredJsonSchema,
  validateLlmCategoryEnhancement,
} from "@/lib/enrichment/llm/category-schemas";
import { buildGeminiCategoryPromptV3 } from "@/lib/enrichment/llm/prompt-builder";

/**
 * Direct Gemini SDK enrichment (unified LLM core, phase 1 of the evidence
 * pipeline). Flash-Lite is primary; gemini-2.5-flash is the fuller-capacity
 * fallback when the primary errors or returns invalid JSON. Thinking is
 * disabled so the fallback stays inside the enrichment timeout.
 */
const DEFAULT_PRIMARY_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_FALLBACK_MODEL = "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 15000;

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export type GeminiCategoryInput = {
  finalUrl: string;
  /** null when classification found nothing — the model must then suggest one. */
  category: ItemCategory | null;
  categorySuggestionAllowed?: boolean;
  categorySuggestionReason?: string;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  structured: Record<string, unknown>;
  rawMetadata: RawMetadata;
  /** Readable main-content text (snapshot innerText or stripped fetched HTML). */
  pageText: string | null;
};

export type GeminiCategoryResult =
  | {
      status: "enhanced";
      enhancement: LlmCategoryEnhancement;
      providerMetadata: Record<string, unknown>;
    }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

const itemCategoryValues: ItemCategory[] = [
  "books",
  "movies_and_tv",
  "restaurants",
  "products",
  "travel",
  "recipes",
  "articles",
  "music",
  "videos",
  "apps",
];

export function buildGeminiResponseJsonSchema(
  categorySuggestionAllowed: boolean,
  category: ItemCategory | null,
) {
  const properties: Record<string, unknown> = {
    title: { type: "string" },
    subtitle: { type: "string" },
    description: { type: "string" },
    image_url: { type: "string" },
    structured: buildStructuredJsonSchema(
      categorySuggestionAllowed || category === null ? undefined : category,
    ),
    field_sources: {
      type: "object",
      additionalProperties: { type: "string", enum: [...FIELD_SOURCE_VALUES] },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sources: { type: "array", items: { type: "string" }, minItems: 1 },
    notes: { type: "string" },
  };

  const required = ["confidence", "sources"];

  if (categorySuggestionAllowed || category === null) {
    properties.category_suggestion = { type: "string", enum: itemCategoryValues };
    properties.category_confidence = { type: "number", minimum: 0, maximum: 1 };
  }
  if (category === null) {
    required.push("category_suggestion", "category_confidence");
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

export function normalizeGeminiPayload(
  category: ItemCategory | null,
  payload: unknown,
): GeminiCategoryResult {
  const validation = validateLlmCategoryEnhancement(category, payload);
  if (!validation.ok) return { status: "failed", reason: validation.reason };
  return {
    status: "enhanced",
    enhancement: validation.value,
    providerMetadata: { provider: "gemini", status: "enhanced" },
  };
}

export async function enhanceCategoryWithGemini(
  input: GeminiCategoryInput,
): Promise<GeminiCategoryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { status: "skipped", reason: "missing_api_key" };

  const timeoutEnv = Number.parseInt(process.env.ENRICHMENT_TIMEOUT_MS ?? "", 10);
  const timeoutMs = Number.isFinite(timeoutEnv) && timeoutEnv > 0 ? timeoutEnv : DEFAULT_TIMEOUT_MS;

  const prompt = buildGeminiCategoryPromptV3(input);
  const schema = buildGeminiResponseJsonSchema(
    input.categorySuggestionAllowed === true,
    input.category,
  );

  const primary = process.env.GEMINI_ENRICHMENT_MODEL || DEFAULT_PRIMARY_MODEL;
  const models = primary === DEFAULT_FALLBACK_MODEL ? [primary] : [primary, DEFAULT_FALLBACK_MODEL];

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  let lastReason = "llm_failed";
  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          abortSignal: controller.signal,
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseJsonSchema: schema,
        },
      });

      const parsed = typeof response.text === "string" ? JSON.parse(response.text) : null;
      const normalized = normalizeGeminiPayload(input.category, parsed);
      if (normalized.status === "enhanced") {
        return {
          ...normalized,
          providerMetadata: { ...normalized.providerMetadata, model },
        };
      }
      if (normalized.status === "failed") lastReason = normalized.reason;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : "llm_failed";
    } finally {
      clearTimeout(timeout);
    }
  }

  return { status: "failed", reason: lastReason };
}
```

- [ ] **Step 4: Run tests + type check**

Run: `npx vitest run src/lib/enrichment/llm/gemini-category-enhancer.test.ts src/lib/enrichment/llm/prompt-builder.test.ts; npx tsc --noEmit`
Expected: both test files PASS; `tsc` flags `enrich-item.ts` callers (fixed in Task 11) — if those are the only errors, proceed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/llm/gemini-category-enhancer.ts src/lib/enrichment/llm/gemini-category-enhancer.test.ts
git commit -m "feat: move category enrichment to the direct Gemini SDK with enforced response schema"
```

---

### Task 10: Eligibility runs for uncategorized items; merge becomes junk-aware

**Files:**
- Modify: `src/lib/enrichment/llm/eligibility.ts`
- Modify: `src/lib/enrichment/llm/merge-llm-enrichment.ts`
- Tests: `src/lib/enrichment/llm/eligibility.test.ts`, `src/lib/enrichment/llm/merge-llm-enrichment.test.ts`

- [ ] **Step 1: Add failing eligibility tests**

Append to `src/lib/enrichment/llm/eligibility.test.ts`:

```typescript
describe("decideLlmEligibility uncategorized", () => {
  it("is eligible with category suggestion when category is null", () => {
    const result = decideLlmEligibility({
      enabled: true,
      hasApiKey: true,
      fetchBlocked: false,
      category: null,
      title: "Some page",
      description: null,
      structured: {},
    });
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("uncategorized");
    expect(result.categorySuggestionAllowed).toBe(true);
    expect(result.categorySuggestionReason).toBe("uncategorized");
  });

  it("stays disabled for null category when the flag is off", () => {
    const result = decideLlmEligibility({
      enabled: false,
      hasApiKey: true,
      fetchBlocked: false,
      category: null,
      title: null,
      description: null,
      structured: {},
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("disabled");
  });
});
```

- [ ] **Step 2: Add failing merge tests**

Append to `src/lib/enrichment/llm/merge-llm-enrichment.test.ts` (follow the existing helper style at the top of that file for building `current`/`llmResult` fixtures):

```typescript
describe("mergeLlmEnrichment junk-aware + uncategorized", () => {
  it("replaces a junk description", () => {
    const merged = mergeLlmEnrichment({
      current: {
        title: "The Dark Knight",
        subtitle: null,
        description: "Access Denied - you do not have permission to view this page today.",
        image_url: null,
        category: "movies_and_tv",
        category_confidence: 0.95,
        category_source: "domain",
        structured: {},
        rawMetadata: {},
      },
      llmResult: {
        status: "enhanced",
        enhancement: {
          confidence: 0.8,
          sources: ["page_text"],
          description: "Batman faces the Joker as Gotham descends into chaos.",
        },
        providerMetadata: { provider: "gemini" },
      },
      now: "2026-06-13T00:00:00.000Z",
    });
    expect(merged.description).toBe("Batman faces the Joker as Gotham descends into chaos.");
  });

  it("applies a category suggestion to an uncategorized item", () => {
    const merged = mergeLlmEnrichment({
      current: {
        title: "selva-restaurant",
        subtitle: null,
        description: null,
        image_url: null,
        category: null,
        category_confidence: 0.3,
        category_source: "heuristic",
        structured: {},
        rawMetadata: {},
      },
      categorySuggestionAllowed: true,
      categorySuggestionReason: "uncategorized",
      llmResult: {
        status: "enhanced",
        enhancement: {
          confidence: 0.6,
          sources: ["url"],
          category_suggestion: "restaurants",
          category_confidence: 0.75,
          title: "Selva",
          structured: { place_name: "Selva" },
        },
        providerMetadata: { provider: "gemini" },
      },
      now: "2026-06-13T00:00:00.000Z",
    });
    expect(merged.category).toBe("restaurants");
    expect(merged.category_source).toBe("llm");
    expect(merged.structured.place_name).toBe("Selva");
  });

  it("clamps recorded confidence to 0.7 when all fields are model knowledge", () => {
    const merged = mergeLlmEnrichment({
      current: {
        title: "Dune",
        subtitle: null,
        description: null,
        image_url: null,
        category: "books",
        category_confidence: 0.95,
        category_source: "domain",
        structured: {},
        rawMetadata: {},
      },
      llmResult: {
        status: "enhanced",
        enhancement: {
          confidence: 0.95,
          sources: ["model_knowledge"],
          structured: { authors: ["Frank Herbert"], published_year: 1965 },
          field_sources: { authors: "model_knowledge", published_year: "model_knowledge" },
        },
        providerMetadata: { provider: "gemini" },
      },
      now: "2026-06-13T00:00:00.000Z",
    });
    const llmMeta = merged.rawMetadata.llm as Record<string, unknown>;
    expect(llmMeta.confidence).toBe(0.7);
    expect(llmMeta.field_sources).toEqual({
      authors: "model_knowledge",
      published_year: "model_knowledge",
    });
  });
});
```

- [ ] **Step 3: Run to verify the new tests fail**

Run: `npx vitest run src/lib/enrichment/llm/eligibility.test.ts src/lib/enrichment/llm/merge-llm-enrichment.test.ts`
Expected: new tests FAIL (type errors on `category: null`, junk description not replaced, no confidence clamp).

- [ ] **Step 4: Implement eligibility changes**

In `src/lib/enrichment/llm/eligibility.ts`:

```typescript
// input type: category becomes nullable
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
};

// add "uncategorized" to both unions:
type CategorySuggestionDecision =
  | {
      categorySuggestionAllowed: true;
      categorySuggestionReason: "blocked_or_sparse_fetch" | "manual_no_useful_metadata" | "uncategorized";
    }
  | {
      categorySuggestionAllowed: false;
      categorySuggestionReason: "disabled" | "missing_api_key" | "manual_metadata_useful" | "deterministic_data_sufficient";
    };

export type LlmEligibility =
  | ({ eligible: true; reason: "sparse_category_fields" | "blocked_or_sparse_fetch" | "weak_title_or_description" | "uncategorized" } & CategorySuggestionDecision)
  | ({ eligible: false; reason: "disabled" | "missing_api_key" | "deterministic_data_sufficient" } & CategorySuggestionDecision);
```

In `decideCategorySuggestion`, after the `hasApiKey` check, add:

```typescript
  if (input.category === null) {
    return { categorySuggestionAllowed: true, categorySuggestionReason: "uncategorized" };
  }
```

In `decideLlmEligibility`, after the `missing_api_key` check, add:

```typescript
  if (input.category === null) {
    return { eligible: true, reason: "uncategorized", ...categorySuggestion };
  }
```

(The `importantFieldsByCategory[input.category]` lookup below is now only reached with a non-null category; TypeScript narrows this automatically after the early return.)

- [ ] **Step 5: Implement merge changes**

In `src/lib/enrichment/llm/merge-llm-enrichment.ts`:

Update imports and the `current` type:

```typescript
import { isJunkDescription, isWeakTitle } from "@/lib/enrichment/meta-utils";
```

```typescript
  current: {
    title: string | null;
    subtitle: string | null;
    description: string | null;
    image_url: string | null;
    category: ItemCategory | null;
    category_confidence: number;
    category_source: CategorySource;
    structured: Record<string, unknown>;
    rawMetadata: Record<string, unknown>;
  };
```

In the enhanced branch, before the return, compute the clamped confidence:

```typescript
  const fieldSources = enhancement.field_sources;
  const knowledgeOnly =
    fieldSources !== undefined &&
    Object.keys(fieldSources).length > 0 &&
    Object.values(fieldSources).every((source) => source === "model_knowledge");
  const recordedConfidence = knowledgeOnly
    ? Math.min(enhancement.confidence, 0.7)
    : enhancement.confidence;
```

Replace the `description` line of the returned object with the junk-aware version, and record provenance:

```typescript
  return {
    title: nextTitle,
    subtitle: current.subtitle ?? enhancement.subtitle ?? null,
    description:
      isJunkDescription(current.description) && enhancement.description?.trim()
        ? enhancement.description.trim()
        : current.description,
    image_url: current.image_url ?? enhancement.image_url ?? null,
    category: shouldApplyCategorySuggestion ? categorySuggestion : current.category,
    category_confidence: shouldApplyCategorySuggestion
      ? categorySuggestionConfidence
      : current.category_confidence,
    category_source: shouldApplyCategorySuggestion ? "llm" : current.category_source,
    structured,
    rawMetadata: addLlmMetadata(current.rawMetadata, {
      ...input.llmResult.providerMetadata,
      provider: "gemini",
      status: "enhanced",
      confidence: recordedConfidence,
      sources: enhancement.sources,
      field_sources: fieldSources,
      returned_fields: returnedFields,
      category_suggestion: categorySuggestionMetadata,
      enriched_at: input.now,
    }),
  };
```

(`MergeLlmOutput` keeps the same shape — `category` is now `ItemCategory | null`, which downstream `buildSubtitle`/`defaultCardAspect`/`mergeDisplay` in `enrich-item.ts` already accept.)

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/lib/enrichment/llm/eligibility.test.ts src/lib/enrichment/llm/merge-llm-enrichment.test.ts`
Expected: PASS (existing + new). The pre-existing "description under 30 chars is replaced" behavior is subsumed by `isJunkDescription` — existing tests should still pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/enrichment/llm/eligibility.ts src/lib/enrichment/llm/eligibility.test.ts src/lib/enrichment/llm/merge-llm-enrichment.ts src/lib/enrichment/llm/merge-llm-enrichment.test.ts
git commit -m "feat: LLM eligibility for uncategorized items and junk-aware merge with provenance"
```

---### Task 11: Wire `enrichItem` — snapshot-first evidence, page text, new gating

**Files:**
- Modify: `src/lib/jobs/enrich-item.ts`

No dedicated unit-test file exists for `enrichItem` (it is integration-tested via route tests and QA). Verification here is the full suite + type check.

- [ ] **Step 1: Update imports**

In `src/lib/jobs/enrich-item.ts`, replace the `isGatewayConfigured` import and add the new modules:

```typescript
import { extractPageText } from "@/lib/enrichment/page-text";
import { readCaptureSnapshot, snapshotToFetchResult } from "@/lib/enrichment/snapshot-adapter";
import { isGeminiConfigured } from "@/lib/enrichment/llm/gemini-category-enhancer";
```

Remove: `import { isGatewayConfigured } from "@/lib/ai/gateway-config";`

- [ ] **Step 2: Snapshot-first evidence gathering**

Replace the evidence-gathering block at the top of the `try` (the `openLibrary` / `fetchResult` / `extracted` section) with:

```typescript
    // Open Library work pages keep their JSON-API path (clean English title);
    // otherwise a capture snapshot (rendered, logged-in, bot-check-passed DOM
    // from the extension) beats a server fetch of the same URL.
    const openLibrary = await enrichOpenLibraryWork(row.canonical_url);
    const snapshot = openLibrary ? null : readCaptureSnapshot(row.raw_metadata);

    const fetchResult = openLibrary
      ? openLibrary.fetchResult
      : snapshot
        ? snapshotToFetchResult(snapshot, row.canonical_url)
        : await fetchPage(row.canonical_url);

    const extracted = openLibrary
      ? openLibrary.extracted
      : await applyEnrichmentFallbacks(
          fetchResult,
          extractFromHtml(fetchResult.html, {
            finalUrl: fetchResult.finalUrl,
            statusCode: fetchResult.statusCode,
          }),
          { requestUrl: row.canonical_url },
        );

    const pageText = snapshot?.text ?? (openLibrary ? null : extractPageText(fetchResult.html));
```

- [ ] **Step 3: Preserve the snapshot in the rewritten raw_metadata**

`extracted.raw_metadata` replaces the whole `raw_metadata` column on save, which would drop the stored snapshot. Replace the `mergedRawMetadata` initialization:

```typescript
    let mergedRawMetadata: Record<string, unknown> = {
      ...(extracted.raw_metadata as unknown as Record<string, unknown>),
      ...(snapshot
        ? { capture_snapshot: snapshot, evidence_source: "capture_snapshot" }
        : { evidence_source: openLibrary ? "open_library" : "server_fetch" }),
    };
```

- [ ] **Step 4: Blocked/sparse flags and the LLM call**

A snapshot is never bot-blocked:

```typescript
    const fetchBlocked = snapshot ? false : isBotBlockPage(fetchResult.html, fetchResult.statusCode);
```

Replace the eligibility + LLM block (delete the `mergedCategory ? … : {eligible:false…}` ternary) with:

```typescript
    const llmEligibility = decideLlmEligibility({
      enabled: process.env.LLM_ENRICHMENT_ENABLED === "true",
      hasApiKey: isGeminiConfigured(),
      fetchBlocked,
      fetchSparse,
      category: mergedCategory,
      categorySource: classification.category_source,
      title: mergedTitle,
      description: mergedDescription,
      image_url: mergedImageUrl,
      structured: mergedStructured,
    });

    if (llmEligibility.eligible) {
      const llmResult = await enhanceCategoryWithGemini({
        finalUrl: fetchResult.finalUrl,
        category: mergedCategory,
        categorySuggestionAllowed: llmEligibility.categorySuggestionAllowed,
        categorySuggestionReason: llmEligibility.categorySuggestionReason,
        title: mergedTitle,
        subtitle: mergedSubtitle,
        description: mergedDescription,
        image_url: mergedImageUrl,
        structured: mergedStructured,
        rawMetadata: extracted.raw_metadata,
        pageText,
      });

      const merged = mergeLlmEnrichment({
        current: {
          title: mergedTitle,
          subtitle: mergedSubtitle,
          description: mergedDescription,
          image_url: mergedImageUrl,
          category: mergedCategory,
          category_confidence: mergedCategoryConfidence,
          category_source: mergedCategorySource,
          structured: mergedStructured,
          rawMetadata: mergedRawMetadata,
        },
        categorySuggestionAllowed: llmEligibility.categorySuggestionAllowed,
        categorySuggestionReason: llmEligibility.categorySuggestionReason,
        llmResult,
        now: new Date().toISOString(),
      });

      mergedTitle = merged.title;
      mergedSubtitle = merged.subtitle;
      mergedDescription = merged.description;
      mergedImageUrl = merged.image_url;
      mergedStructured = merged.structured;
      mergedRawMetadata = merged.rawMetadata;
      mergedCategory = merged.category;
      mergedCategoryConfidence = merged.category_confidence;
      mergedCategorySource = merged.category_source;
    }
```

(Note `let mergedCategory: ItemCategory | null = classification.category;` — the existing declaration already infers the nullable type from `classify()`. The `if (llmEligibility.eligible && mergedCategory)` guard becomes `if (llmEligibility.eligible)`.)

- [ ] **Step 5: Full verification**

Run: `npx tsc --noEmit; npm test`
Expected: type check clean; full suite PASS. Common breakages to fix here:
- `mergeLlmEnrichment` current.category type (fixed in Task 10).
- Any test that mocked `isGatewayConfigured` for enrich paths — switch the mock to `GEMINI_API_KEY` env stubbing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/jobs/enrich-item.ts
git commit -m "feat: enrichment prefers capture snapshots, feeds page text, and gates LLM on GEMINI_API_KEY"
```

---

### Task 12: "Enrich with AI" button gets page text + world-knowledge tiers

**Files:**
- Modify: `src/lib/enrichment/llm/gemini-item-rewriter.ts`
- Modify: `src/app/api/items/[id]/ai-enrichment-proposal/route.ts`
- Test: `src/lib/enrichment/llm/gemini-item-rewriter.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/enrichment/llm/gemini-item-rewriter.test.ts` (match existing import style):

```typescript
describe("buildGeminiItemRewritePrompt v3 additions", () => {
  const input = {
    finalUrl: "https://www.goodreads.com/book/show/44767458-dune",
    currentCategory: "books" as const,
    title: "Dune",
    subtitle: null,
    description: null,
    image_url: null,
    structured: {},
    rawMetadata: {
      fetched_at: "2026-06-13T00:00:00.000Z",
      final_url: "https://www.goodreads.com/book/show/44767458-dune",
      status_code: 200,
      open_graph: {},
      twitter: {},
      json_ld: [],
      parser: "goodreads",
    },
    pageText: "Dune is set in the distant future amidst a feudal interstellar society.",
  };

  it("includes page text when provided", () => {
    const prompt = buildGeminiItemRewritePrompt(input);
    expect(prompt).toContain("Page text:");
    expect(prompt).toContain("feudal interstellar society");
  });

  it("omits the page text line when null", () => {
    const prompt = buildGeminiItemRewritePrompt({ ...input, pageText: null });
    expect(prompt).not.toContain("Page text:");
  });

  it("allows bounded world knowledge but bans volatile facts", () => {
    const prompt = buildGeminiItemRewritePrompt(input);
    expect(prompt).toContain("model_knowledge");
    expect(prompt).toMatch(/NEVER invent .*(prices|volatile)/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/enrichment/llm/gemini-item-rewriter.test.ts`
Expected: new tests FAIL (`pageText` not in input type; prompt lacks the new rules).

- [ ] **Step 3: Update the rewriter**

In `src/lib/enrichment/llm/gemini-item-rewriter.ts`:

Add to `GeminiItemRewriteInput`:

```typescript
  /** Readable main-content text (snapshot innerText or freshly fetched). */
  pageText: string | null;
```

In `buildGeminiItemRewritePrompt`, replace the single line `"Do not invent facts like authors, prices, ratings, or dates without evidence.",` with:

```typescript
    "If the URL or title unambiguously identifies a specific well-known work, venue, or product (e.g. an IMDb title ID, a Goodreads book page, an exact title plus author), you MAY fill widely-known stable facts (authors, directors, year, genres, page counts, cuisine) from your own knowledge; include \"model_knowledge\" in sources when you do.",
    "NEVER invent volatile or unverifiable facts: prices, current ratings, ratings counts, availability, addresses, phone numbers, opening hours. These require page evidence.",
```

And in the metadata block at the bottom, after the `Parser:` line, add:

```typescript
    ...(input.pageText ? [`Page text: ${input.pageText}`] : []),
```

- [ ] **Step 4: Feed page text from the proposal route**

In `src/app/api/items/[id]/ai-enrichment-proposal/route.ts`:

Add imports:

```typescript
import { fetchPage } from "@/lib/enrichment/fetch";
import { extractPageText } from "@/lib/enrichment/page-text";
import { readCaptureSnapshot } from "@/lib/enrichment/snapshot-adapter";
```

Before the `rewriteItemWithGemini` call, build the page text (snapshot first, live fetch as fallback, fail-open):

```typescript
  const snapshot = readCaptureSnapshot(row.raw_metadata);
  let pageText: string | null = snapshot?.text ?? null;
  if (!pageText) {
    try {
      const fetched = await fetchPage(row.canonical_url);
      pageText = extractPageText(fetched.html);
    } catch {
      pageText = null;
    }
  }
```

And pass it:

```typescript
  const result = await rewriteItemWithGemini({
    finalUrl: row.canonical_url,
    currentCategory: row.category,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    image_url: row.image_url,
    structured: asRecord(row.structured),
    rawMetadata: normalizeRawMetadata(row.raw_metadata, row.canonical_url),
    pageText,
  });
```

- [ ] **Step 5: Run tests + type check**

Run: `npx vitest run src/lib/enrichment/llm/gemini-item-rewriter.test.ts; npx tsc --noEmit`
Expected: PASS / clean. If other call sites of `rewriteItemWithGemini` exist (grep for it), pass `pageText: null` there.

- [ ] **Step 6: Commit**

```bash
git add src/lib/enrichment/llm/gemini-item-rewriter.ts src/lib/enrichment/llm/gemini-item-rewriter.test.ts "src/app/api/items/[id]/ai-enrichment-proposal/route.ts"
git commit -m "feat: AI rewrite proposal uses page text and bounded world knowledge"
```

---

### Task 13: Environment + docs updates

**Files:**
- Modify: `.env.local.example`
- Modify: `AGENTS.md` (only if needed — see step 2)

- [ ] **Step 1: Update `.env.local.example`**

Replace the AI Gateway / Gemini comment block (lines 16–28) with:

```bash
# Vercel AI Gateway — powers AI recommendations (Workstream F).
# On Vercel deployments, auth is automatic via OIDC (VERCEL_OIDC_TOKEN) — no key needed.
# For local dev, create a key at Vercel dashboard → AI Gateway → API Keys:
AI_GATEWAY_API_KEY=
# Optional recommendation model fallback override (comma-separated, in priority order):
# RECOMMEND_MODELS=openai/gpt-5-nano,google/gemini-2.5-flash-lite,anthropic/claude-haiku-4.5

# Gemini API key — powers ALL LLM enrichment (background category enrichment
# and the "Enrich with AI" button) via the direct Gemini SDK.
# Create at https://aistudio.google.com/apikey (free tier covers single-user volume).
GEMINI_API_KEY=
LLM_ENRICHMENT_ENABLED=false
# GEMINI_ENRICHMENT_MODEL=gemini-2.5-flash-lite   # primary; falls back to gemini-2.5-flash
# ENRICHMENT_TIMEOUT_MS=15000
```

- [ ] **Step 2: Check AGENTS.md consistency**

AGENTS.md already states: "LLM enrichment is optional and gated by `LLM_ENRICHMENT_ENABLED=true` plus `GEMINI_API_KEY`" — this was aspirational before and is now true; no change needed there. Verify there are no other AGENTS.md references to `ENRICHMENT_MODELS` or gateway-based enrichment; update if found.

- [ ] **Step 3: Extend the QA checklist**

In `docs/qa-checklist.md`, add a short "Extension snapshot capture" section to the URL matrix:

```markdown
## Extension snapshot capture (phase 1, evidence pipeline)

| URL | Client | Expected |
|-----|--------|----------|
| Amazon product page | Chrome extension | Card gets real title + image; `raw_metadata.evidence_source = "capture_snapshot"`; no `fetch_blocked_or_sparse` |
| Google Maps place | Chrome extension | Place name extracted from snapshot meta/URL; category `restaurants` or `travel` |
| Same Amazon URL, re-saved via extension | Chrome extension | Response `created: false`; snapshot stored; sparse/failed item re-enriches |
| Obscure homepage | Manual add (no snapshot) | LLM runs with reason `uncategorized`; `raw_metadata.llm.field_sources` labels model-knowledge fields |
```

- [ ] **Step 4: Commit**

```bash
git add .env.local.example AGENTS.md docs/qa-checklist.md
git commit -m "docs: GEMINI_API_KEY now powers all enrichment; document new env knobs and QA rows"
```

---

### Task 14: Eval script runs prompt v3

The spec's rollout rule (from `docs/category-schemas.md`): review eval results before broadly enabling LLM enrichment in production. The eval harness must therefore exercise the production prompt (v3), and it must keep compiling now that `GeminiCategoryInput` requires `pageText`.

**Files:**
- Modify: `scripts/eval-gemini-prompt.ts`

- [ ] **Step 1: Switch the import and the local input type**

In `scripts/eval-gemini-prompt.ts`:

```typescript
// import change:
import { buildGeminiCategoryPromptV3 } from "../src/lib/enrichment/llm/prompt-builder";
```

Extend the script's local `GeminiCategoryInput` type with the new field:

```typescript
type GeminiCategoryInput = {
  finalUrl: string;
  category: ItemCategory;
  categorySuggestionAllowed?: boolean;
  categorySuggestionReason?: string;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  structured: Record<string, unknown>;
  rawMetadata: RawMetadata;
  pageText: string | null;
};
```

- [ ] **Step 2: Update call sites**

Replace every `buildGeminiCategoryPromptV2(...)` call in the script with `buildGeminiCategoryPromptV3(...)`. For existing fixtures that have no page text, add `pageText: null` to each fixture input object (the compiler will list every site that needs it — run `npx tsc --noEmit -p tsconfig.json` or open the file in the editor and fix all reported lines).

Also extend the script's local `VALID_SOURCE_LABELS` array with the v3 labels so source-label assertions don't fail on valid output:

```typescript
const VALID_SOURCE_LABELS = [
  "url",
  "open_graph",
  "twitter",
  "json_ld",
  "title_tag",
  "existing_structured",
  "page_text",
  "model_knowledge",
] as const;
```

- [ ] **Step 3: Verify it compiles and (optionally) run the eval**

Run: `npx tsc --noEmit`
Expected: clean.

Optionally, with `GEMINI_API_KEY` set in the environment, run the eval and skim the results before flipping `LLM_ENRICHMENT_ENABLED=true` in production (this costs a few dozen free-tier Gemini calls):

Run: `npx tsx scripts/eval-gemini-prompt.ts`

Note for the implementer: some eval expectations were written for the strict no-world-knowledge v1/v2 prompts (e.g. `structuredFieldsAbsent` on identifiable entities). If v3 now legitimately fills those fields from model knowledge, the expectation — not the prompt — is what changed semantics; update such cases to expect `model_knowledge`-sourced fields rather than absence, and say so in the task report.

- [ ] **Step 4: Commit**

```bash
git add scripts/eval-gemini-prompt.ts
git commit -m "chore: eval harness exercises the v3 enrichment prompt"
```

---

### Task 15: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 2: Full build (extension tsc + Next.js)**

Run: `npm run build`
Expected: clean build. Fix any type errors in files touched by this plan.

- [ ] **Step 3: Lint check on touched files**

Run: `npx eslint src/lib/capture src/lib/enrichment src/lib/jobs/enrich-item.ts src/app/api/capture extension/page-snapshot.ts`
Expected: no new errors (skip if the repo has no eslint config wired this way; `npm run lint` otherwise).

- [ ] **Step 4: Smoke test locally (manual, requires `.env.local`)**

1. `npm run dev`, sign in (`npm run qa:session-url` if needed).
2. Set `LLM_ENRICHMENT_ENABLED=true` and `GEMINI_API_KEY` in `.env.local` (restart dev server).
3. Load the rebuilt extension (`npm run build`, then reload unpacked from `extension/`) and save an Amazon product page. Verify in the item detail / DB that `raw_metadata.capture_snapshot` exists, `raw_metadata.evidence_source` is `capture_snapshot`, and the card has a real title/image instead of a bot-block shell.
4. Add an obscure URL by hand (no extension) and verify `raw_metadata.llm` shows the model ran with reason `uncategorized` or `sparse_category_fields`, and `field_sources` labels any model-knowledge fields.
5. Open an existing sparse item and press "Enrich with AI" — the proposal should now contain structured fields.

- [ ] **Step 5: Commit any fixes, then update the plan checkboxes and commit the plan**

```bash
git add -A
git commit -m "chore: phase-1 enrichment evidence pipeline verification fixes"
```

---

## Out of scope (later phases — do NOT build now)

- **Phase 2:** grounded-search two-step (`googleSearch` tool), Jina Reader fallback.
- **Phase 3:** resolver registry (TMDB reuse, Google Books, iTunes, YouTube oEmbed, GitHub).
- **Phase 4:** `captureVisibleTab` screenshots, multimodal image input, "needs details" badge, "Update with page data" popup UX.
- Chrome Web Store submission of the bumped extension version is a user action (requires store review); flag it in the final report.

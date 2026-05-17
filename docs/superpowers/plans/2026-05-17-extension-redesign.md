# Chrome Extension Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Chrome extension popup around the approved Capture Card direction while preserving current capture behavior and adding a category hint plus contextual `Open thèque` action.

**Architecture:** Add a small shared category-hint utility used by the capture API and enrichment classifier. The API stores a selected hint as transient structured input for enrichment, not as a manual override. The extension popup remains plain MV3 HTML/CSS/TypeScript, with a card-like layout that posts `category_hint` only when the user selects a shelf-style category.

**Tech Stack:** Chrome MV3 extension, TypeScript, Next.js App Router route handlers, Supabase typed rows, Vitest with jsdom, existing thèque CSS tokens and capture API.

**Spec:** [extension-redesign-design.md](../specs/2026-05-17-extension-redesign-design.md)

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/capture/category-hint.ts` | Create | Validate API category hints and read stored capture hints from item structured data |
| `src/lib/capture/category-hint.test.ts` | Create | Unit coverage for valid, omitted, invalid, and stored category hints |
| `src/lib/types/api.ts` | Modify | Add optional `category_hint` to `CaptureRequestBody` |
| `src/lib/classify/index.ts` | Modify | Allow a category hint to beat low-confidence path/fallback heuristics without beating domain/schema evidence |
| `src/lib/classify/index.test.ts` | Modify | Cover hint precedence |
| `src/lib/jobs/enrich-item.ts` | Modify | Pass stored capture hint into classification during enrichment |
| `src/app/api/capture/route.ts` | Modify | Validate and store category hints on newly captured items |
| `src/app/api/capture/route.test.ts` | Create | Route-level coverage for invalid hints and stored hints |
| `extension/popup.html` | Modify | Replace the current linear popup with Capture Card layout and new controls |
| `extension/popup.ts` | Modify | Wire category hint, current-tab card, contextual open action, and existing save/connect flows |
| `extension/styles.css` | Modify | Align popup styling with thèque web app tokens and Capture Card structure |
| `extension/popup.test.ts` | Create | Popup behavior coverage for category hint posting and contextual open action |
| `docs/chrome-extension.md` | Modify | Document category hints and contextual open behavior |

Do not create new extension helper `.ts` files unless the implementation also updates `.gitignore` for their compiled `.js` output. Keeping popup behavior inside `extension/popup.ts` avoids extra MV3 module output files.

---

## Task 1: Category Hint Utility and Classifier Semantics

**Files:**
- Create: `src/lib/capture/category-hint.ts`
- Create: `src/lib/capture/category-hint.test.ts`
- Modify: `src/lib/classify/index.ts`
- Modify: `src/lib/classify/index.test.ts`

- [ ] **Step 1: Write category-hint utility tests**

Create `src/lib/capture/category-hint.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  captureCategoryHintFromStructured,
  parseCaptureCategoryHint,
} from "@/lib/capture/category-hint";

describe("parseCaptureCategoryHint", () => {
  it("returns null when the hint is omitted or Auto is represented as an empty value", () => {
    expect(parseCaptureCategoryHint(undefined)).toBeNull();
    expect(parseCaptureCategoryHint(null)).toBeNull();
    expect(parseCaptureCategoryHint("")).toBeNull();
  });

  it("accepts item categories used by the extension shelf labels", () => {
    expect(parseCaptureCategoryHint("books")).toBe("books");
    expect(parseCaptureCategoryHint("movies_and_tv")).toBe("movies_and_tv");
    expect(parseCaptureCategoryHint("restaurants")).toBe("restaurants");
    expect(parseCaptureCategoryHint("products")).toBe("products");
    expect(parseCaptureCategoryHint("travel")).toBe("travel");
    expect(parseCaptureCategoryHint("articles")).toBe("articles");
    expect(parseCaptureCategoryHint("recipes")).toBe("recipes");
  });

  it("rejects values that are not extension category hints", () => {
    expect(parseCaptureCategoryHint("gifts")).toBe("invalid");
    expect(parseCaptureCategoryHint("music")).toBe("invalid");
    expect(parseCaptureCategoryHint(["books"])).toBe("invalid");
  });
});

describe("captureCategoryHintFromStructured", () => {
  it("reads a stored capture category hint", () => {
    expect(captureCategoryHintFromStructured({ capture_category_hint: "movies_and_tv" })).toBe(
      "movies_and_tv",
    );
  });

  it("returns null when structured data has no valid stored hint", () => {
    expect(captureCategoryHintFromStructured({})).toBeNull();
    expect(captureCategoryHintFromStructured({ capture_category_hint: "gifts" })).toBeNull();
    expect(captureCategoryHintFromStructured(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run utility tests and confirm they fail**

Run:

```bash
npm test -- src/lib/capture/category-hint.test.ts
```

Expected: FAIL because `src/lib/capture/category-hint.ts` does not exist.

- [ ] **Step 3: Implement category-hint utility**

Create `src/lib/capture/category-hint.ts`:

```typescript
import type { ItemCategory, Json } from "@/lib/database.types";

export const EXTENSION_CATEGORY_HINTS = [
  "books",
  "movies_and_tv",
  "restaurants",
  "products",
  "travel",
  "articles",
  "recipes",
] as const satisfies readonly ItemCategory[];

const EXTENSION_CATEGORY_HINT_SET = new Set<ItemCategory>(EXTENSION_CATEGORY_HINTS);

export type CaptureCategoryHintParseResult = ItemCategory | null | "invalid";

export function parseCaptureCategoryHint(value: unknown): CaptureCategoryHintParseResult {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  return EXTENSION_CATEGORY_HINT_SET.has(value as ItemCategory) ? (value as ItemCategory) : "invalid";
}

export function captureCategoryHintFromStructured(structured: Json): ItemCategory | null {
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) return null;
  const value = structured.capture_category_hint;
  const parsed = parseCaptureCategoryHint(value);
  return parsed === "invalid" ? null : parsed;
}
```

- [ ] **Step 4: Run utility tests and confirm they pass**

Run:

```bash
npm test -- src/lib/capture/category-hint.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add classifier tests for hint precedence**

Add these tests inside the existing `describe("classify", () => { ... })` block in `src/lib/classify/index.test.ts`, after the current fallback test and before the closing `});`:

```typescript
  it("uses a category hint when there is no stronger classification evidence", () => {
    const r = classify({
      domain: "unknown.example",
      pathname: "/post/hello",
      jsonLd: [],
      categoryHint: "movies_and_tv",
    });

    expect(r.category).toBe("movies_and_tv");
    expect(r.category_confidence).toBe(0.6);
    expect(r.category_source).toBe("heuristic");
  });

  it("lets domain evidence beat a category hint", () => {
    const r = classify({
      domain: "goodreads.com",
      pathname: "/book/show/1",
      jsonLd: [],
      categoryHint: "movies_and_tv",
    });

    expect(r.category).toBe("books");
    expect(r.category_source).toBe("domain");
  });

  it("lets schema.org evidence beat a category hint", () => {
    const r = classify({
      domain: "example.org",
      pathname: "/story",
      jsonLd: [{ "@type": "Recipe", name: "Soup" }],
      categoryHint: "travel",
    });

    expect(r.category).toBe("recipes");
    expect(r.category_source).toBe("schema_org");
  });
```

- [ ] **Step 6: Run classifier tests and confirm they fail**

Run:

```bash
npm test -- src/lib/classify/index.test.ts
```

Expected: FAIL with TypeScript/runtime errors because `classify` does not accept `categoryHint`.

- [ ] **Step 7: Update classifier to accept a category hint**

In `src/lib/classify/index.ts`, update the `classify` input type and add hint handling after schema evidence and before path/fallback heuristics:

```typescript
export function classify(input: {
  domain: string;
  pathname: string;
  jsonLd: unknown[];
  categoryHint?: ItemCategory | null;
}): Classification {
  const domainHit = classifyFromDomain(input.domain);
  if (domainHit) {
    return {
      category: domainHit.category,
      category_confidence: domainHit.category_confidence,
      category_source: "domain",
    };
  }

  const schemaHit = classifyFromJsonLd(input.jsonLd);
  if (schemaHit) {
    return {
      category: schemaHit.category,
      category_confidence: schemaHit.category_confidence,
      category_source: "schema_org",
    };
  }

  if (input.categoryHint) {
    return {
      category: input.categoryHint,
      category_confidence: 0.6,
      category_source: "heuristic",
    };
  }

  const pathHit = pathHeuristic(input.pathname);
  if (pathHit) {
    return {
      category: pathHit.category,
      category_confidence: pathHit.category_confidence,
      category_source: "heuristic",
    };
  }

  return {
    category: "articles",
    category_confidence: 0.4,
    category_source: "heuristic",
  };
}
```

- [ ] **Step 8: Run classifier and utility tests**

Run:

```bash
npm test -- src/lib/capture/category-hint.test.ts src/lib/classify/index.test.ts
```

Expected: PASS.

---

## Task 2: Capture API Stores Hints for Enrichment

**Files:**
- Modify: `src/lib/types/api.ts`
- Modify: `src/app/api/capture/route.ts`
- Modify: `src/lib/jobs/enrich-item.ts`
- Create: `src/app/api/capture/route.test.ts`

- [ ] **Step 1: Update capture request type**

In `src/lib/types/api.ts`, add `category_hint?: ItemCategory | null;` to `CaptureRequestBody`:

```typescript
export type CaptureRequestBody = {
  url: string;
  note?: string | null;
  category_hint?: ItemCategory | null;
  tag_names?: string[];
  collection_ids?: string[];
  source: ItemSource;
};
```

- [ ] **Step 2: Add route tests for invalid and stored hints**

Create `src/app/api/capture/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const lookupCaptureTokenUser = vi.fn();
  const getSessionUserOrNull = vi.fn();
  const enrichItem = vi.fn();
  const insertSpy = vi.fn();
  const adminFrom = vi.fn();

  function makeItemsTable(createdRow: Record<string, unknown>) {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: insertSpy.mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: createdRow, error: null }),
    };
  }

  return {
    lookupCaptureTokenUser,
    getSessionUserOrNull,
    enrichItem,
    insertSpy,
    adminFrom,
    makeItemsTable,
  };
});

vi.mock("next/server", () => ({
  after: (callback: () => void) => callback(),
}));

vi.mock("@/lib/auth/capture-token", () => ({
  lookupCaptureTokenUser: mocks.lookupCaptureTokenUser,
  parseBearerToken: (value: string | null) => value?.replace(/^Bearer\s+/i, "") ?? null,
}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserOrNull: mocks.getSessionUserOrNull,
}));

vi.mock("@/lib/jobs/enrich-item", () => ({
  enrichItem: mocks.enrichItem,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mocks.adminFrom,
  }),
}));

describe("POST /api/capture category hints", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.lookupCaptureTokenUser.mockReset();
    mocks.getSessionUserOrNull.mockReset();
    mocks.enrichItem.mockReset();
    mocks.insertSpy.mockReset();
    mocks.adminFrom.mockReset();
  });

  it("rejects an invalid category_hint", async () => {
    const { POST } = await import("./route");

    const res = await POST(
      new Request("https://theque.app/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/story",
          source: "chrome_extension",
          category_hint: "music",
        }),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ code: "invalid_category_hint" });
  });

  it("stores a valid category_hint as structured enrichment input", async () => {
    const createdRow = {
      id: "item-1",
      url: "https://example.com/story",
      canonical_url: "https://example.com/story",
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
      created_at: "2026-05-17T12:00:00.000Z",
    };
    const itemsTable = mocks.makeItemsTable(createdRow);
    mocks.adminFrom.mockImplementation((table: string) => {
      if (table !== "items") throw new Error(`Unexpected table ${table}`);
      return itemsTable;
    });
    mocks.lookupCaptureTokenUser.mockResolvedValue({ userId: "user-1" });

    const { POST } = await import("./route");

    const res = await POST(
      new Request("https://theque.app/api/capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer bmly_test_secret",
        },
        body: JSON.stringify({
          url: "https://example.com/story",
          source: "chrome_extension",
          category_hint: "movies_and_tv",
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        structured: { capture_category_hint: "movies_and_tv" },
        status: "inbox",
        processing_status: "pending",
      }),
    );
  });
});
```

- [ ] **Step 3: Run route tests and confirm they fail**

Run:

```bash
npm test -- src/app/api/capture/route.test.ts
```

Expected: FAIL because the route does not validate or store `category_hint`.

- [ ] **Step 4: Validate category hints in the capture route**

In `src/app/api/capture/route.ts`, add imports:

```typescript
import { parseCaptureCategoryHint } from "@/lib/capture/category-hint";
```

Keep the existing `Database` and `ItemSource` imports in the same type import:

```typescript
import type { Database, ItemSource, Json } from "@/lib/database.types";
```

After note validation, add:

```typescript
  const categoryHint = parseCaptureCategoryHint(body.category_hint);
  if (categoryHint === "invalid") {
    return jsonResponse({ code: "invalid_category_hint" }, { status: 400 });
  }
```

- [ ] **Step 5: Store category hints on new rows only**

In the `insertRow` object in `src/app/api/capture/route.ts`, add `structured`:

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
  };
```

Do not change the existing duplicate path in this task. Existing items should still return `created: false` unchanged.

- [ ] **Step 6: Pass stored hints into enrichment classification**

In `src/lib/jobs/enrich-item.ts`, add the import:

```typescript
import { captureCategoryHintFromStructured } from "@/lib/capture/category-hint";
```

Inside `enrichItem`, after `const preserveManual = row.category_source === "manual" && row.category !== null;`, add:

```typescript
    const categoryHint = preserveManual ? null : captureCategoryHintFromStructured(row.structured);
```

Update the `classify` call:

```typescript
        classify({
          domain: urlObj.hostname,
          pathname: urlObj.pathname,
          jsonLd: extracted.raw_metadata.json_ld as unknown[],
          categoryHint,
        });
```

- [ ] **Step 7: Run targeted API/classification tests**

Run:

```bash
npm test -- src/lib/capture/category-hint.test.ts src/lib/classify/index.test.ts src/app/api/capture/route.test.ts
```

Expected: PASS.

---

## Task 3: Popup Capture Card UI and Behavior

**Files:**
- Modify: `extension/popup.html`
- Modify: `extension/popup.ts`
- Modify: `extension/styles.css`
- Create: `extension/popup.test.ts`

- [ ] **Step 1: Write popup behavior tests**

Create `extension/popup.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

function setPopupHtml() {
  document.body.innerHTML = `
    <main class="ks-popup">
      <header class="ks-header">
        <div>
          <h1>thèque</h1>
          <p class="ks-tagline">Save this page</p>
        </div>
        <button type="button" id="ks-open-theque" class="ks-link-btn">Open thèque</button>
      </header>
      <section class="ks-capture-card">
        <p id="ks-tab-title" class="ks-tab-title">Current tab</p>
        <p id="ks-tab-url" class="ks-tab-url"></p>
        <p id="ks-status" class="ks-status ks-status--muted" role="status"></p>
        <button type="button" id="ks-connect-session" class="ks-btn ks-btn-secondary">Connect your account</button>
      </section>
      <label class="ks-label" for="ks-category">Category hint <span class="ks-optional">(optional)</span></label>
      <select id="ks-category" class="ks-input ks-select">
        <option value="">Auto</option>
        <option value="books">Books</option>
        <option value="movies_and_tv">Watch</option>
      </select>
      <label class="ks-label" for="ks-note">Note <span class="ks-optional">(optional)</span></label>
      <textarea id="ks-note" class="ks-input ks-textarea"></textarea>
      <button type="button" id="ks-save" class="ks-btn ks-btn-primary">Save to thèque</button>
      <details class="ks-settings"><summary>Settings</summary></details>
    </main>
  `;
}

async function loadPopup() {
  await import("./popup.ts");
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await Promise.resolve();
  await Promise.resolve();
}

describe("extension popup", () => {
  let storageGet: ReturnType<typeof vi.fn>;
  let storageSet: ReturnType<typeof vi.fn>;
  let tabsCreate: ReturnType<typeof vi.fn>;
  let tabsQuery: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    setPopupHtml();
    storageGet = vi.fn().mockResolvedValue({
      theque_capture_token: "bmly_test_secret",
      theque_connected_email: "user@example.com",
    });
    storageSet = vi.fn().mockResolvedValue(undefined);
    tabsCreate = vi.fn().mockResolvedValue(undefined);
    tabsQuery = vi.fn().mockResolvedValue([
      { url: "https://example.com/story", title: "Example Story" },
    ]);
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({ created: true }),
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("chrome", {
      runtime: { id: "extension-id" },
      storage: { local: { get: storageGet, set: storageSet } },
      tabs: { create: tabsCreate, query: tabsQuery },
    });
  });

  it("posts category_hint when a shelf category is selected", async () => {
    await loadPopup();

    const category = document.getElementById("ks-category") as HTMLSelectElement;
    category.value = "movies_and_tv";
    document.getElementById("ks-save")?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://theque.app/api/capture",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/story",
          category_hint: "movies_and_tv",
          source: "chrome_extension",
        }),
      }),
    );
  });

  it("omits category_hint when Auto is selected", async () => {
    await loadPopup();

    document.getElementById("ks-save")?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://theque.app/api/capture",
      expect.objectContaining({
        body: JSON.stringify({
          url: "https://example.com/story",
          source: "chrome_extension",
        }),
      }),
    );
  });

  it("opens the library from Open thèque when connected", async () => {
    await loadPopup();

    document.getElementById("ks-open-theque")?.click();

    expect(tabsCreate).toHaveBeenCalledWith({ url: "https://theque.app/library" });
  });

  it("opens extension connect from Open thèque when disconnected", async () => {
    storageGet.mockResolvedValue({});
    await loadPopup();

    document.getElementById("ks-open-theque")?.click();

    expect(tabsCreate).toHaveBeenCalledWith({
      url: "https://theque.app/settings/extension-connect?extensionId=extension-id",
    });
  });
});
```

- [ ] **Step 2: Run popup tests and confirm they fail**

Run:

```bash
npm test -- extension/popup.test.ts
```

Expected: FAIL because `ks-open-theque`, `ks-category`, and category-hint posting are not implemented in the current popup.

- [ ] **Step 3: Update popup HTML structure**

Replace the content inside `<main class="ks-popup">` in `extension/popup.html` with:

```html
<header class="ks-header">
  <div>
    <h1>thèque</h1>
    <p class="ks-tagline">Save this page</p>
  </div>
  <button type="button" id="ks-open-theque" class="ks-link-btn">Open thèque</button>
</header>

<section class="ks-capture-card" aria-label="Current tab capture">
  <div>
    <p id="ks-tab-title" class="ks-tab-title">Current tab</p>
    <p id="ks-tab-url" class="ks-tab-url"></p>
  </div>
  <p id="ks-status" class="ks-status ks-status--muted" role="status"></p>
  <button type="button" id="ks-connect-session" class="ks-btn ks-btn-secondary">
    Connect your account
  </button>
</section>

<label class="ks-label" for="ks-category">
  Category hint <span class="ks-optional">(optional)</span>
</label>
<select id="ks-category" class="ks-input ks-select">
  <option value="">Auto</option>
  <option value="books">Books</option>
  <option value="movies_and_tv">Watch</option>
  <option value="restaurants">Eat</option>
  <option value="products">Shop</option>
  <option value="travel">Travel</option>
  <option value="articles">Read</option>
  <option value="recipes">Cook</option>
</select>

<label class="ks-label" for="ks-note">Note <span class="ks-optional">(optional)</span></label>
<textarea
  id="ks-note"
  class="ks-input ks-textarea"
  rows="3"
  maxlength="2000"
  placeholder="Add a note for future you"
></textarea>

<button type="button" id="ks-save" class="ks-btn ks-btn-primary">Save to thèque</button>

<details class="ks-settings">
  <summary>Settings</summary>
  <p class="ks-hint">
    This extension connects to https://theque.app. If your connection expires or is revoked,
    reconnect from this popup.
  </p>
</details>
```

- [ ] **Step 4: Update popup TypeScript for current tab, category hint, and contextual open**

In `extension/popup.ts`, extend `getActiveTabUrl` into `getActiveTab`:

```typescript
async function getActiveTab(): Promise<{ url: string; title: string } | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url;
  if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    return null;
  }
  return { url, title: tab.title?.trim() || "Current tab" };
}
```

Add a shared connect opener:

```typescript
async function openConnectPage() {
  await chrome.storage.local.set({ [STORAGE_KEYS.baseUrl]: THEQUE_APP_URL });
  const url = new URL("/settings/extension-connect", THEQUE_APP_URL);
  url.searchParams.set("extensionId", chrome.runtime.id);
  await chrome.tabs.create({ url: url.toString() });
}
```

Inside `DOMContentLoaded`, get the new elements and hydrate the card:

```typescript
  const noteEl = $("ks-note") as HTMLTextAreaElement;
  const categoryEl = $("ks-category") as HTMLSelectElement;
  const openAppBtn = $("ks-open-theque") as HTMLButtonElement;
  const connectBtn = $("ks-connect-session") as HTMLButtonElement;
  const tabTitleEl = $("ks-tab-title") as HTMLParagraphElement;
  const tabUrlEl = $("ks-tab-url") as HTMLParagraphElement;

  const activeTab = await getActiveTab();
  if (activeTab) {
    tabTitleEl.textContent = activeTab.title;
    tabUrlEl.textContent = new URL(activeTab.url).hostname;
  } else {
    tabTitleEl.textContent = "Restricted page";
    tabUrlEl.textContent = "This page cannot be captured.";
  }
```

Replace the current connect click handler with:

```typescript
  connectBtn.addEventListener("click", async () => {
    try {
      await openConnectPage();
      setStatus("Opened thèque to connect this extension.", "muted");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not open connect page.", "err");
    }
  });
```

Add contextual open behavior:

```typescript
  openAppBtn.addEventListener("click", async () => {
    try {
      const { token: currentToken } = await loadSettings();
      if (currentToken.startsWith("bmly_")) {
        await chrome.tabs.create({ url: new URL("/library", THEQUE_APP_URL).toString() });
        return;
      }
      await openConnectPage();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not open thèque.", "err");
    }
  });
```

In the save handler, replace `getActiveTabUrl()` usage with `getActiveTab()` and include `category_hint` only when selected:

```typescript
      const tab = await getActiveTab();
      if (!tab) {
        setStatus("This page cannot be captured (restricted URL).", "err");
        return;
      }

      const note = noteEl.value.trim();
      const categoryHint = categoryEl.value.trim();
      const res = await fetch(`${apiBase}/api/capture`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tok}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: tab.url,
          ...(note ? { note } : {}),
          ...(categoryHint ? { category_hint: categoryHint } : {}),
          source: "chrome_extension",
        }),
      });
```

- [ ] **Step 5: Update popup styles to match Capture Card**

In `extension/styles.css`, update these existing selectors and add the new selectors:

```css
body {
  margin: 0;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    Segoe UI,
    Roboto,
    sans-serif;
  font-size: 13px;
  color: #1c1917;
  background: #faf8f5;
  width: 340px;
}

.ks-popup {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.ks-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ks-link-btn {
  border: 1px solid rgba(28, 25, 23, 0.09);
  border-radius: 999px;
  background: #fffefb;
  color: #92400e;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 9px;
}

.ks-link-btn:hover {
  background: #f5f0e8;
}

.ks-capture-card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(28, 25, 23, 0.09);
  border-radius: 14px;
  background: #fffefb;
}

.ks-tab-title {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-serif, Georgia, "Times New Roman", serif;
  font-size: 15px;
  font-weight: 600;
}

.ks-tab-url {
  margin: 2px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #78716c;
  font-size: 11px;
}

.ks-status {
  margin: 0;
  min-height: 1.35em;
  line-height: 1.35;
  font-size: 12px;
}

.ks-select {
  appearance: auto;
  min-height: 38px;
}

.ks-btn {
  width: 100%;
  margin-top: 0;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.ks-settings {
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px solid rgba(28, 25, 23, 0.09);
}
```

Keep the existing status color classes, input focus ring, textarea sizing, primary/secondary button colors, hint copy, and settings summary styles unless they conflict with the new layout.

- [ ] **Step 6: Run popup tests**

Run:

```bash
npm test -- extension/popup.test.ts extension/background.test.ts
```

Expected: PASS.

- [ ] **Step 7: Verify extension TypeScript build**

Run:

```bash
npm run build:extension
```

Expected: PASS and generated `extension/popup.js` and `extension/background.js` remain ignored by git.

---

## Task 4: Docs and Full Verification

**Files:**
- Modify: `docs/chrome-extension.md`

- [ ] **Step 1: Update extension docs**

In `docs/chrome-extension.md`, update the Capture section payload example to include optional `category_hint`:

```json
{
  "url": "<current tab URL>",
  "note": "optional",
  "category_hint": "movies_and_tv",
  "source": "chrome_extension"
}
```

Immediately below the payload, add:

```markdown
`category_hint` is optional. The popup shows shelf-style labels (`Books`, `Watch`, `Eat`, `Shop`, `Travel`, `Read`, `Cook`) and sends the matching category only when the user chooses a value other than `Auto`. The hint is enrichment input, not a manual override.
```

In the First-time setup section, keep `Connect your account` and add one sentence:

```markdown
When connected, **Open thèque** opens the library. When disconnected, it opens the extension connection flow.
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
npm test -- src/lib/capture/category-hint.test.ts src/lib/classify/index.test.ts src/app/api/capture/route.test.ts extension/popup.test.ts extension/background.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run extension build**

Run:

```bash
npm run build:extension
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Run full production build**

Run:

```bash
npm run build
```

Expected: PASS. If the build fails because of environment variables unrelated to this extension work, capture the exact error and run the narrow verification commands from Steps 2 and 3 before reporting.

- [ ] **Step 6: Manual extension QA**

Run:

```bash
npm run build:extension
```

Load the unpacked `extension/` folder in Chrome, then verify:

1. Disconnected popup shows thèque branding and a connect path.
2. `Open thèque` while disconnected opens `https://theque.app/settings/extension-connect?extensionId=<id>`.
3. Connected popup shows the connected email.
4. `Open thèque` while connected opens `https://theque.app/library`.
5. Saving with `Auto` selected posts no `category_hint`.
6. Saving with `Watch` selected posts `category_hint: "movies_and_tv"`.
7. Saving a restricted Chrome URL still shows the restricted URL error.
8. Duplicate save still shows "Already in your library."

- [ ] **Step 7: Review changed files**

Run:

```bash
git diff -- extension/popup.html extension/popup.ts extension/styles.css src/lib/capture/category-hint.ts src/lib/types/api.ts src/lib/classify/index.ts src/lib/jobs/enrich-item.ts src/app/api/capture/route.ts docs/chrome-extension.md
```

Expected: Diff only contains extension redesign, category-hint support, tests, and docs. Do not create a git commit unless the user explicitly asks for one.

---

## Self-Review Notes

- Spec coverage: the plan preserves existing connection, save, note, status, restricted URL, duplicate, and settings behavior; adds Capture Card UI; uses `thèque` in user-facing UI; adds shelf-style category hints; makes `Open thèque` contextual.
- Placeholder scan: every task has concrete files, snippets, commands, and expected outcomes.
- Type consistency: the API request field is consistently `category_hint`; stored structured key is consistently `capture_category_hint`; classifier input is consistently `categoryHint`.

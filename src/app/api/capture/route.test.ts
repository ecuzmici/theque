import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const lookupCaptureTokenUser = vi.fn();
  const getSessionUserOrNull = vi.fn();
  const enrichItem = vi.fn();
  const afterResults: unknown[] = [];
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();
  const adminFrom = vi.fn();

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

  return {
    lookupCaptureTokenUser,
    getSessionUserOrNull,
    enrichItem,
    afterResults,
    insertSpy,
    updateSpy,
    adminFrom,
    makeItemsTable,
  };
});

vi.mock("next/server", () => ({
  after: (callback: () => unknown) => {
    mocks.afterResults.push(callback());
  },
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
    mocks.afterResults.length = 0;
    mocks.insertSpy.mockReset();
    mocks.updateSpy.mockClear();
    mocks.adminFrom.mockReset();
  });

  it("returns the enrichment promise from the after callback for new captures", async () => {
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
    let resolveEnrichment!: (value: string) => void;
    const enrichmentPromise = new Promise<string>((resolve) => {
      resolveEnrichment = resolve;
    });
    mocks.enrichItem.mockReturnValue(enrichmentPromise);

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
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.enrichItem).toHaveBeenCalledWith("item-1");
    const afterPromise = mocks.afterResults[0] as Promise<unknown>;
    let afterSettled = false;
    void afterPromise.then(() => {
      afterSettled = true;
    });

    await Promise.resolve();

    expect(afterSettled).toBe(false);
    resolveEnrichment("ready");
    await expect(afterPromise).resolves.toBeUndefined();
    expect(afterSettled).toBe(true);
  });

  it("rejects an invalid category_hint for a new URL after auth", async () => {
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
          url: "https://example.com/unique-new-path",
          source: "chrome_extension",
          category_hint: "wishlist",
        }),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ code: "invalid_category_hint" });
    expect(mocks.insertSpy).not.toHaveBeenCalled();
  });

  it("returns created: false for duplicate URL even when category_hint is invalid", async () => {
    const existingRow = {
      id: "item-existing",
      url: "https://example.com/story",
      canonical_url: "https://example.com/story",
      domain: "example.com",
      title: "Existing",
      subtitle: null,
      description: null,
      image_url: null,
      category: "articles",
      category_confidence: 0.9,
      status: "want",
      processing_status: "ready",
      source: "chrome_extension",
      note: null,
      created_at: "2026-05-01T12:00:00.000Z",
    };
    const itemsTable = mocks.makeItemsTable(existingRow as Record<string, unknown>, {
      existing: existingRow as Record<string, unknown>,
    });
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
          category_hint: "music",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(false);
    expect(body.item.id).toBe("item-existing");
    expect(mocks.insertSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["omitted", (url: string) => ({ url, source: "chrome_extension" })],
    ["null", (url: string) => ({ url, source: "chrome_extension", category_hint: null })],
    ["empty string", (url: string) => ({ url, source: "chrome_extension", category_hint: "" })],
  ])("accepts %s category_hint on insert with structured {}", async (_label, buildBody) => {
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
    const url = `https://example.com/${_label.replace(/\s+/g, "-")}-693e2`;

    const res = await POST(
      new Request("https://theque.app/api/capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer bmly_test_secret",
        },
        body: JSON.stringify(buildBody(url)),
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        structured: {},
      }),
    );
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
      description: "This is a sufficiently long description for an article saved in the library.",
      category: "articles",
      category_confidence: 0.9,
      structured: { author: "Jane Doe", publisher: "Example Publisher" },
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

  it("on duplicate URL: re-queues a ready but sparse item", async () => {
    const existing = baseRow({
      id: "item-sparse",
      processing_status: "ready",
      title: "A good descriptive title",
      description: null,
      category: "products",
      category_confidence: 0.9,
      structured: {},
      enrichment_error: null,
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
    expect(mocks.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ processing_status: "pending" }),
    );
    expect(mocks.enrichItem).toHaveBeenCalledWith("item-sparse");
  });

  it("accepts legacy tag_names and collection_ids without linking them", async () => {
    const createdRow = baseRow();
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
        headers: { "Content-Type": "application/json", Authorization: "Bearer bmly_t" },
        body: JSON.stringify({
          url: "https://example.com/p/legacy",
          source: "chrome_extension",
          tag_names: ["sci-fi"],
          collection_ids: ["00000000-0000-0000-0000-000000000001"],
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.adminFrom).toHaveBeenCalledWith("items");
    expect(mocks.adminFrom.mock.calls.some(([table]) => table === "tags")).toBe(false);
    expect(mocks.adminFrom.mock.calls.some(([table]) => table === "collections")).toBe(false);
  });
});

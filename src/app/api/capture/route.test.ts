import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const lookupCaptureTokenUser = vi.fn();
  const getSessionUserOrNull = vi.fn();
  const enrichItem = vi.fn();
  const afterResults: unknown[] = [];
  const insertSpy = vi.fn();
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
      single: vi.fn().mockResolvedValue({ data: createdRow, error: null }),
    };
  }

  return {
    lookupCaptureTokenUser,
    getSessionUserOrNull,
    enrichItem,
    afterResults,
    insertSpy,
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
          category_hint: "music",
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

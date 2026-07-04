import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const TEST_FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");

const mocks = vi.hoisted(() => {
  const getSessionUserOrNull = vi.fn();
  const from = vi.fn();
  return { getSessionUserOrNull, from };
});

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserOrNull: mocks.getSessionUserOrNull,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));

/** A chainable query stub: every non-terminal call returns itself; `.range()` resolves. */
function makeQuery(rows: Record<string, unknown>[]) {
  const query: Record<string, unknown> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    in: vi.fn(() => query),
    textSearch: vi.fn(() => query),
    range: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  return query;
}

/**
 * A chainable query stub matching `fetchLibraryItemsForShelf`'s shape, where
 * `.range()` sits in the *middle* of the chain (further `.eq/.neq/.in/.lt`
 * calls come after it) rather than being the terminal call. Every method
 * returns the same object, and the object itself is thenable — mirroring the
 * real Postgrest builder — so `await query` resolves without an explicit
 * terminal call.
 */
function makeShelfQuery(rows: Record<string, unknown>[]) {
  const query: Record<string, unknown> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    in: vi.fn(() => query),
    lt: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    then: (resolve: (result: { data: unknown; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return query;
}

function makeLibraryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "item-1",
    title: "Some Title",
    subtitle: null,
    image_url: null,
    image_storage_path: null,
    domain: "example.com",
    category: "books",
    status: "want",
    processing_status: "ready",
    created_at: "2026-05-01T00:00:00.000Z",
    display: null,
    canonical_url: "https://example.com/a",
    dominant_color: null,
    dominant_hue: null,
    rating_personal: null,
    verdict: null,
    done_at: null,
    ...overrides,
  };
}

const SESSION_USER = { id: "user-1" };

describe("GET /api/items (ADR 0013 field decryption)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.FIELD_ENCRYPTION_KEY = TEST_FIELD_ENCRYPTION_KEY;
    mocks.getSessionUserOrNull.mockReset();
    mocks.from.mockReset();
  });

  it("returns plaintext verdict for rows stored as enc.*", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const { encryptField } = await import("@/lib/crypto/field-crypto");
    const row = {
      id: "item-1",
      title: "Some Title",
      subtitle: null,
      image_url: null,
      image_storage_path: null,
      domain: "example.com",
      category: "books",
      status: "done",
      processing_status: "ready",
      canonical_url: "https://example.com/a",
      created_at: "2026-05-01T00:00:00.000Z",
      display: null,
      dominant_color: null,
      dominant_hue: null,
      rating_personal: 5,
      verdict: encryptField("re-read after the breakup"),
      done_at: "2026-05-02T00:00:00.000Z",
    };
    mocks.from.mockImplementation((table: string) => {
      if (table !== "items") throw new Error(`Unexpected table ${table}`);
      return makeQuery([row]);
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("https://theque.app/api/items"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].verdict).toBe("re-read after the breakup");
  });

  it("returns a legacy plaintext verdict unchanged (day-one guarantee)", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const row = {
      id: "item-2",
      title: "Another Title",
      subtitle: null,
      image_url: null,
      image_storage_path: null,
      domain: "example.com",
      category: "movies_and_tv",
      status: "done",
      processing_status: "ready",
      canonical_url: "https://example.com/b",
      created_at: "2026-05-01T00:00:00.000Z",
      display: null,
      dominant_color: null,
      dominant_hue: null,
      rating_personal: 4,
      verdict: "legacy plaintext verdict",
      done_at: "2026-05-02T00:00:00.000Z",
    };
    mocks.from.mockImplementation(() => makeQuery([row]));

    const { GET } = await import("./route");
    const res = await GET(new Request("https://theque.app/api/items"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].verdict).toBe("legacy plaintext verdict");
  });

  it("fails the whole request (not garbled content) when a row's verdict is tampered", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const goodRow = {
      id: "item-3",
      title: "Good Row",
      subtitle: null,
      image_url: null,
      image_storage_path: null,
      domain: "example.com",
      category: "books",
      status: "done",
      processing_status: "ready",
      canonical_url: "https://example.com/c",
      created_at: "2026-05-01T00:00:00.000Z",
      display: null,
      dominant_color: null,
      dominant_hue: null,
      rating_personal: 5,
      verdict: null,
      done_at: null,
    };
    const tamperedRow = {
      ...goodRow,
      id: "item-4",
      verdict: "enc.v1.aGVsbG8.dGFtcGVyZWQ.dGFn", // well-formed shape, bogus ciphertext/tag
    };
    mocks.from.mockImplementation(() => makeQuery([goodRow, tamperedRow]));

    const { GET } = await import("./route");
    const res = await GET(new Request("https://theque.app/api/items"));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("decrypt_failed");
    // Never leak ciphertext or a garbled render in the body.
    expect(JSON.stringify(body)).not.toContain("enc.v1");
  });
});

describe("GET /api/items?shelf=... (the client-direct read reroute, ADR 0013 issue #68)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.FIELD_ENCRYPTION_KEY = TEST_FIELD_ENCRYPTION_KEY;
    mocks.getSessionUserOrNull.mockReset();
    mocks.from.mockReset();
  });

  it("drives fetchLibraryItemsForShelf's shelf filter + sort and returns a decrypted verdict", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const { encryptField } = await import("@/lib/crypto/field-crypto");
    const row = makeLibraryRow({
      category: "books",
      status: "done",
      verdict: encryptField("re-read after the breakup"),
    });

    let capturedQuery: ReturnType<typeof makeShelfQuery> | undefined;
    mocks.from.mockImplementation((table: string) => {
      if (table !== "items") throw new Error(`Unexpected table ${table}`);
      capturedQuery = makeShelfQuery([row]);
      return capturedQuery;
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("https://theque.app/api/items?shelf=books&sort=title"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    // Plaintext verdict — the reroute's whole point (never raw PostgREST ciphertext).
    expect(body.items[0].verdict).toBe("re-read after the breakup");

    // The "books" shelf filter (src/lib/shelves.ts): category "books",
    // excludeDismissed + excludeDone, no explicit status filter.
    expect(capturedQuery?.neq).toHaveBeenCalledWith("status", "dismissed");
    expect(capturedQuery?.neq).toHaveBeenCalledWith("status", "done");
    expect(capturedQuery?.in).toHaveBeenCalledWith("category", ["books"]);
    // sort=title -> order by title ascending.
    expect(capturedQuery?.order).toHaveBeenCalledWith("title", {
      ascending: true,
      nullsFirst: false,
    });
  });

  it("forwards the numeric offset param into the shelf query's range", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    let capturedQuery: ReturnType<typeof makeShelfQuery> | undefined;
    mocks.from.mockImplementation(() => {
      capturedQuery = makeShelfQuery([]);
      return capturedQuery;
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("https://theque.app/api/items?shelf=done&offset=10"));

    expect(res.status).toBe(200);
    expect(capturedQuery?.range).toHaveBeenCalledWith(10, 34); // 10 + PAGE_SIZE(24)
  });

  it("paginates with an opaque next_cursor encoding offset + page size when there's more", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const rows = Array.from({ length: 25 }, (_, i) => makeLibraryRow({ id: `item-${i}` }));
    mocks.from.mockImplementation(() => makeShelfQuery(rows));

    const { GET } = await import("./route");
    const res = await GET(new Request("https://theque.app/api/items?shelf=all"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(24);
    expect(body.next_cursor).not.toBeNull();
    const decoded = JSON.parse(Buffer.from(body.next_cursor, "base64url").toString("utf8"));
    expect(decoded).toEqual({ o: 24 });
  });

  it("fails closed (not garbled content) when a shelf row's verdict is tampered", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const goodRow = makeLibraryRow({ id: "item-good" });
    const tamperedRow = makeLibraryRow({
      id: "item-bad",
      verdict: "enc.v1.aGVsbG8.dGFtcGVyZWQ.dGFn", // well-formed shape, bogus ciphertext/tag
    });
    mocks.from.mockImplementation(() => makeShelfQuery([goodRow, tamperedRow]));

    const { GET } = await import("./route");
    const res = await GET(new Request("https://theque.app/api/items?shelf=all"));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("decrypt_failed");
    expect(JSON.stringify(body)).not.toContain("enc.v1");
  });
});

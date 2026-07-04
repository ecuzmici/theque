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

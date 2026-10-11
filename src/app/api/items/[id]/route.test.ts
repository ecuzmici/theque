import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const TEST_FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

const mocks = vi.hoisted(() => {
  const getSessionUserOrNull = vi.fn();
  const from = vi.fn();
  const updateSpy = vi.fn();

  function makeItemsTable(opts: {
    initialRow: Record<string, unknown> | null;
    updatedRow?: Record<string, unknown> | null;
  }) {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: opts.initialRow, error: null }),
      single: vi
        .fn()
        .mockResolvedValue({ data: opts.updatedRow ?? opts.initialRow, error: null }),
      update: updateSpy.mockImplementation(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    };
  }

  return { getSessionUserOrNull, from, updateSpy, makeItemsTable };
});

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserOrNull: mocks.getSessionUserOrNull,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));

const SESSION_USER = { id: "user-1" };

describe("GET /api/items/[id] (ADR 0013 field decryption)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.FIELD_ENCRYPTION_KEY = TEST_FIELD_ENCRYPTION_KEY;
    mocks.getSessionUserOrNull.mockReset();
    mocks.from.mockReset();
    mocks.updateSpy.mockReset();
  });

  it("decrypts enc.* note/verdict to plaintext", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const { encryptField } = await import("@/lib/crypto/field-crypto");
    const row = {
      id: "item-1",
      user_id: "user-1",
      status: "done",
      note: encryptField("private note"),
      verdict: encryptField("re-read after the breakup"),
    };
    const itemsTable = mocks.makeItemsTable({ initialRow: row });
    mocks.from.mockImplementation((table: string) => {
      if (table !== "items") throw new Error(`Unexpected table ${table}`);
      return itemsTable;
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("https://theque.app/api/items/item-1"), {
      params: Promise.resolve({ id: "item-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note).toBe("private note");
    expect(body.verdict).toBe("re-read after the breakup");
  });

  it("returns a legacy plaintext row unchanged (day-one guarantee)", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const row = {
      id: "item-2",
      user_id: "user-1",
      status: "want",
      note: "legacy plaintext note",
      verdict: null,
    };
    const itemsTable = mocks.makeItemsTable({ initialRow: row });
    mocks.from.mockImplementation(() => itemsTable);

    const { GET } = await import("./route");
    const res = await GET(new Request("https://theque.app/api/items/item-2"), {
      params: Promise.resolve({ id: "item-2" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note).toBe("legacy plaintext note");
    expect(body.verdict).toBeNull();
  });

  it("fails closed (throws) on a tampered enc.* value instead of rendering ciphertext", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const row = {
      id: "item-3",
      user_id: "user-1",
      status: "done",
      note: "enc.v1.aGVsbG8.dGFtcGVyZWQ.dGFn", // well-formed shape, bogus ciphertext/tag
      verdict: null,
    };
    const itemsTable = mocks.makeItemsTable({ initialRow: row });
    mocks.from.mockImplementation(() => itemsTable);

    const { GET } = await import("./route");
    await expect(
      GET(new Request("https://theque.app/api/items/item-3"), {
        params: Promise.resolve({ id: "item-3" }),
      }),
    ).rejects.toThrow();
  });
});

describe("PATCH /api/items/[id] (ADR 0013 field encryption)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.FIELD_ENCRYPTION_KEY = TEST_FIELD_ENCRYPTION_KEY;
    mocks.getSessionUserOrNull.mockReset();
    mocks.from.mockReset();
    mocks.updateSpy.mockReset();
  });

  it("encrypts note and verdict before update; response returns plaintext for both", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const { encryptField } = await import("@/lib/crypto/field-crypto");
    const initialRow = {
      id: "item-1",
      user_id: "user-1",
      status: "done",
      note: null,
      verdict: null,
      display: null,
    };
    const updatedRow = {
      ...initialRow,
      // What the DB would actually hold after the encrypted update.
      note: encryptField("my note"),
      verdict: encryptField("great pick"),
    };
    const itemsTable = mocks.makeItemsTable({ initialRow, updatedRow });
    mocks.from.mockImplementation((table: string) => {
      if (table !== "items") throw new Error(`Unexpected table ${table}`);
      return itemsTable;
    });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("https://theque.app/api/items/item-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "my note", verdict: "great pick" }),
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    );

    expect(res.status).toBe(200);

    const patchArg = mocks.updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof patchArg.note).toBe("string");
    expect((patchArg.note as string).startsWith("enc.")).toBe(true);
    expect(patchArg.note).not.toBe("my note");
    expect(typeof patchArg.verdict).toBe("string");
    expect((patchArg.verdict as string).startsWith("enc.")).toBe(true);
    expect(patchArg.verdict).not.toBe("great pick");

    const body = await res.json();
    expect(body.note).toBe("my note");
    expect(body.verdict).toBe("great pick");
  });

  it("leaves an empty note/verdict as empty strings (never stores enc. of empty)", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const initialRow = {
      id: "item-2",
      user_id: "user-1",
      status: "done",
      note: "old note",
      verdict: "old verdict",
      display: null,
    };
    const updatedRow = { ...initialRow, note: "", verdict: "" };
    const itemsTable = mocks.makeItemsTable({ initialRow, updatedRow });
    mocks.from.mockImplementation(() => itemsTable);

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("https://theque.app/api/items/item-2", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "", verdict: "" }),
      }),
      { params: Promise.resolve({ id: "item-2" }) },
    );

    expect(res.status).toBe(200);
    const patchArg = mocks.updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(patchArg.note).toBe("");
    expect(patchArg.verdict).toBe("");
  });

  async function patch(initialRow: Record<string, unknown>, body: Record<string, unknown>) {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const itemsTable = mocks.makeItemsTable({ initialRow });
    mocks.from.mockImplementation(() => itemsTable);
    const { PATCH } = await import("./route");
    return PATCH(
      new Request("https://theque.app/api/items/item-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    );
  }

  const baseRow = {
    id: "item-1",
    user_id: "user-1",
    status: "want",
    category: "books",
    category_source: "domain",
    category_confidence: 0.9,
    note: null,
    verdict: null,
    display: null,
  };

  it("rejects an enc.v1 note", async () => {
    const res = await patch(baseRow, { note: "enc.v1.a.b.c" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_note");
    expect(mocks.updateSpy).not.toHaveBeenCalled();
  });

  it("rejects an enc.v1 verdict", async () => {
    const res = await patch(baseRow, { verdict: "enc.v1.a.b.c" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_verdict");
    expect(mocks.updateSpy).not.toHaveBeenCalled();
  });

  it("keeps category_source when the category does not change", async () => {
    const res = await patch(baseRow, { category: "books", status: "done" });
    expect(res.status).toBe(200);
    const patchArg = mocks.updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(patchArg).not.toHaveProperty("category");
    expect(patchArg).not.toHaveProperty("category_source");
    expect(patchArg).not.toHaveProperty("category_confidence");
    expect(patchArg.status).toBe("done");
  });

  it("marks the category manual when the category changes", async () => {
    await patch(baseRow, { category: "articles" });
    const patchArg = mocks.updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(patchArg).toMatchObject({
      category: "articles",
      category_source: "manual",
      category_confidence: 1,
    });
  });
});

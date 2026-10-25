import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const TEST_FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

const mocks = vi.hoisted(() => {
  const getSessionUserOrNull = vi.fn();
  const from = vi.fn();
  const updateSpy = vi.fn();
  const inSpy = vi.fn();

  function makeItemsTable(opts: {
    initialRow: Record<string, unknown> | null;
    updatedRow?: Record<string, unknown> | null;
    pins?: { id: string }[];
  }) {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: opts.pins ?? [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: opts.initialRow, error: null }),
      single: vi
        .fn()
        .mockResolvedValue({ data: opts.updatedRow ?? opts.initialRow, error: null }),
      update: updateSpy.mockImplementation(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
        in: inSpy.mockResolvedValue({ error: null }),
      })),
    };
  }

  const deleteItemFiles = vi.fn(async () => ({ coverObjectsRemoved: 0, failures: 0 }));

  return { getSessionUserOrNull, from, updateSpy, inSpy, makeItemsTable, deleteItemFiles };
});

vi.mock("@/lib/items/delete-item-files", () => ({ deleteItemFiles: mocks.deleteItemFiles }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: {} }) }));
vi.mock("@/lib/drive/client", () => ({
  deleteDriveFile: vi.fn(),
  isDriveConfigured: () => true,
}));

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

  async function patch(
    initialRow: Record<string, unknown>,
    body: Record<string, unknown>,
    opts: { pins?: { id: string }[] } = {},
  ) {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const itemsTable = mocks.makeItemsTable({ initialRow, pins: opts.pins });
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

describe("PATCH /api/items/[id] pins", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.FIELD_ENCRYPTION_KEY = TEST_FIELD_ENCRYPTION_KEY;
    mocks.getSessionUserOrNull.mockReset();
    mocks.from.mockReset();
    mocks.updateSpy.mockReset();
    mocks.inSpy.mockReset();
  });

  const row = {
    id: "item-1",
    user_id: "user-1",
    status: "want",
    category: "books",
    pinned_at: null,
    display: null,
  };
  const pins = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `old-${i}` }));

  async function patch(initialRow: Record<string, unknown>, body: Record<string, unknown>, otherPins = 0) {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    const itemsTable = mocks.makeItemsTable({ initialRow, pins: pins(otherPins) });
    mocks.from.mockImplementation(() => itemsTable);
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("https://theque.app/api/items/item-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    );
    return { res, itemsTable };
  }

  it("pins an item under the limit and unpins nothing", async () => {
    const { res } = await patch(row, { pinned: true }, 3);
    expect(res.status).toBe(200);
    const patchArg = mocks.updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof patchArg.pinned_at).toBe("string");
    expect(mocks.inSpy).not.toHaveBeenCalled();
    expect(await res.json()).not.toHaveProperty("unpinned_item_ids");
  });

  it("replaces the oldest pin of the category at the limit", async () => {
    const { res, itemsTable } = await patch(row, { pinned: true }, 4);
    expect(res.status).toBe(200);
    expect(itemsTable.eq).toHaveBeenCalledWith("category", "books");
    expect(itemsTable.order).toHaveBeenCalledWith("pinned_at", { ascending: true });
    expect(mocks.updateSpy).toHaveBeenLastCalledWith({ pinned_at: null });
    expect(mocks.inSpy).toHaveBeenCalledWith("id", ["old-0"]);
    expect((await res.json()).unpinned_item_ids).toEqual(["old-0"]);
  });

  it("keeps the pin time when the item is already pinned", async () => {
    await patch({ ...row, pinned_at: "2026-10-01T00:00:00Z" }, { pinned: true }, 4);
    expect(mocks.updateSpy).not.toHaveBeenCalled();
  });

  it("unpins an item", async () => {
    await patch({ ...row, pinned_at: "2026-10-01T00:00:00Z" }, { pinned: false });
    expect(mocks.updateSpy.mock.calls[0][0]).toEqual({ pinned_at: null });
  });

  it("rejects a pinned value that is not a boolean", async () => {
    const { res } = await patch(row, { pinned: "yes" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_pinned");
  });

  it.each(["done", "dismissed"])("clears the pin when the status becomes %s", async (status) => {
    await patch({ ...row, pinned_at: "2026-10-01T00:00:00Z" }, { status });
    const patchArg = mocks.updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(patchArg.pinned_at).toBeNull();
  });
});

describe("DELETE /api/items/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSessionUserOrNull.mockReset();
    mocks.from.mockReset();
    mocks.deleteItemFiles.mockClear();
  });

  function deleteTable(result: { data: unknown; error: unknown }) {
    const chain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue(result),
    };
    mocks.from.mockImplementation(() => chain);
  }

  async function callDelete() {
    const { DELETE } = await import("./route");
    return DELETE(new Request("https://theque.app/api/items/item-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "item-1" }),
    });
  }

  it("removes the cover and the Drive file after the row delete", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    deleteTable({ data: [{ id: "item-1", file_drive_id: "drive-1" }], error: null });

    const res = await callDelete();

    expect(res.status).toBe(204);
    expect(mocks.deleteItemFiles).toHaveBeenCalledWith(
      { userId: "user-1", itemId: "item-1", driveId: "drive-1" },
      expect.objectContaining({ deleteDriveFile: expect.any(Function) }),
    );
  });

  it("removes no files when no row matched", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
    deleteTable({ data: [], error: null });

    const res = await callDelete();

    expect(res.status).toBe(404);
    expect(mocks.deleteItemFiles).not.toHaveBeenCalled();
  });
});

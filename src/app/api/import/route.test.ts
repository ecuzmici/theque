import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const TEST_FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

const mocks = vi.hoisted(() => {
  const getSessionUserOrNull = vi.fn();
  const rateLimit = vi.fn();
  const upsertSpy = vi.fn();
  const from = vi.fn();

  /** Rows the fake DB already holds, keyed by `url_fingerprint`. */
  const stored = new Set<string>();
  /** Queued upsert outcomes; `null` means "insert normally". */
  const upsertErrors: ({ message: string } | null)[] = [];
  let itemCount = 0;

  function setItemCount(next: number) {
    itemCount = next;
  }

  function itemsTable() {
    return {
      // `checkQuota` and the headroom count: .select(..., {head, count}).eq(...)
      select: vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockResolvedValue({ count: itemCount, error: null }),
      })),
      upsert: vi.fn().mockImplementation((rows: Record<string, unknown>[], options?: unknown) => {
        upsertSpy(rows, options);
        return {
          select: vi.fn().mockImplementation(async () => {
            const failure = upsertErrors.shift();
            if (failure) return { data: null, error: failure };
            const written = rows.filter(
              (row) => !stored.has(row.url_fingerprint as string),
            );
            for (const row of written) stored.add(row.url_fingerprint as string);
            itemCount += written.length;
            return { data: written.map((_, i) => ({ id: `item-${i}` })), error: null };
          }),
        };
      }),
    };
  }

  return {
    getSessionUserOrNull,
    rateLimit,
    upsertSpy,
    from,
    stored,
    upsertErrors,
    setItemCount,
    itemsTable,
  };
});

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserOrNull: mocks.getSessionUserOrNull,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));

function request(body: unknown) {
  return new Request("https://theque.app/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function row(url: string, extra: Record<string, unknown> = {}) {
  return {
    url,
    title: "A title",
    status: "want",
    source_ref: { importer: "pocket-csv", line: 2 },
    ...extra,
  };
}

describe("POST /api/import", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.FIELD_ENCRYPTION_KEY = TEST_FIELD_ENCRYPTION_KEY;
    mocks.getSessionUserOrNull.mockReset();
    mocks.rateLimit.mockReset();
    mocks.upsertSpy.mockReset();
    mocks.from.mockReset();
    mocks.stored.clear();
    mocks.upsertErrors.length = 0;
    mocks.setItemCount(0);

    mocks.getSessionUserOrNull.mockResolvedValue({ id: "user-1" });
    mocks.rateLimit.mockResolvedValue({ ok: true });
    mocks.from.mockImplementation((table: string) => {
      if (table !== "items") throw new Error(`Unexpected table ${table}`);
      return mocks.itemsTable();
    });
  });

  it("requires a session", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(null);

    const { POST } = await import("./route");
    const res = await POST(request({ rows: [row("https://example.com/a")] }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ code: "unauthorized" });
    expect(mocks.upsertSpy).not.toHaveBeenCalled();
  });

  it("rate-limits on its own bucket before touching the database", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 12 });

    const { POST } = await import("./route");
    const res = await POST(request({ rows: [row("https://example.com/a")] }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("12");
    expect(mocks.rateLimit).toHaveBeenCalledWith("import:user-1", expect.any(Number), expect.any(Number));
    expect(mocks.upsertSpy).not.toHaveBeenCalled();
  });

  it("rejects a batch larger than the per-request cap", async () => {
    const { POST, MAX_IMPORT_ROWS_PER_REQUEST } = await import("./route");
    const rows = Array.from({ length: MAX_IMPORT_ROWS_PER_REQUEST + 1 }, (_, i) =>
      row(`https://example.com/${i}`),
    );

    const res = await POST(request({ rows }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: "batch_too_large" });
    expect(mocks.upsertSpy).not.toHaveBeenCalled();
  });

  it("refuses the import when the library is already at the quota", async () => {
    const { MAX_ITEMS_PER_USER } = await import("@/lib/quotas");
    mocks.setItemCount(MAX_ITEMS_PER_USER);

    const { POST } = await import("./route");
    const res = await POST(request({ rows: [row("https://example.com/a")] }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: "quota_exceeded" });
    expect(mocks.upsertSpy).not.toHaveBeenCalled();
  });

  it("imports what fits under the quota and reports the rest as skipped", async () => {
    const { MAX_ITEMS_PER_USER } = await import("@/lib/quotas");
    mocks.setItemCount(MAX_ITEMS_PER_USER - 2);

    const { POST } = await import("./route");
    const res = await POST(
      request({
        rows: [
          row("https://example.com/a"),
          row("https://example.com/b"),
          row("https://example.com/c"),
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(2);
    expect(body.rejected).toEqual([
      expect.objectContaining({ reason: "quota_exceeded", line: 2 }),
    ]);
    expect(body.remaining_quota).toBe(0);
  });

  it("is idempotent: re-importing the same file inserts nothing the second time", async () => {
    const rows = [
      row("https://example.com/a"),
      row("https://example.com/b"),
      row("https://example.com/c"),
    ];

    const { POST } = await import("./route");

    const first = await POST(request({ rows }));
    const firstBody = await first.json();
    expect(firstBody.inserted).toBe(3);
    expect(firstBody.duplicates).toBe(0);

    const second = await POST(request({ rows }));
    const secondBody = await second.json();
    expect(secondBody.inserted).toBe(0);
    expect(secondBody.duplicates).toBe(3);

    // Dedup is the unique constraint's job: on-conflict-do-nothing, not a
    // pre-flight select that races itself.
    expect(mocks.upsertSpy.mock.calls[0][1]).toEqual({
      onConflict: "user_id,url_fingerprint",
      ignoreDuplicates: true,
    });
  });

  it("counts URLs that normalize to the same fingerprint as duplicates", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      request({
        rows: [
          row("https://example.com/a"),
          // Same item once tracking params are stripped by `normalizeUrl`.
          row("https://example.com/a?utm_source=newsletter"),
        ],
      }),
    );

    const body = await res.json();
    expect(body.inserted).toBe(1);
    expect(body.duplicates).toBe(1);
  });

  it("surfaces every rejected row with a reason instead of dropping it", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      request({
        rows: [
          row("https://example.com/ok"),
          { ...row(""), source_ref: { line: 4 } },
          { ...row("ftp://files.example.com/x"), source_ref: { line: 5 } },
          { ...row(`https://example.com/${"x".repeat(5000)}`), source_ref: { line: 6 } },
        ],
      }),
    );

    const body = await res.json();
    expect(body.inserted).toBe(1);
    expect(body.rejected).toEqual([
      { line: 4, reason: "missing_url" },
      expect.objectContaining({ line: 5, reason: "invalid_url" }),
      expect.objectContaining({ line: 6, reason: "url_too_long" }),
    ]);
  });

  it("encrypts the verdict before insert and carries the file's fields through", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      request({
        rows: [
          row("https://example.com/read", {
            title: "Piranesi",
            subtitle: "Susanna Clarke",
            category: "books",
            status: "done",
            rating_personal: 5,
            verdict: "the best thing I read all year",
            done_at: "2026-01-04T00:00:00.000Z",
          }),
        ],
      }),
    );

    expect(res.status).toBe(200);
    const inserted = mocks.upsertSpy.mock.calls[0][0][0] as Record<string, unknown>;

    expect(typeof inserted.verdict).toBe("string");
    expect((inserted.verdict as string).startsWith("enc.")).toBe(true);
    expect(inserted.verdict).not.toContain("best thing");

    const { decryptField } = await import("@/lib/crypto/field-crypto");
    expect(decryptField(inserted.verdict as string)).toBe("the best thing I read all year");

    expect(inserted).toMatchObject({
      user_id: "user-1",
      source: "import",
      title: "Piranesi",
      subtitle: "Susanna Clarke",
      category: "books",
      status: "done",
      rating_personal: 5,
      done_at: "2026-01-04T00:00:00.000Z",
      // Stays claimable by the enrichment job — "trust the file, drain later".
      processing_status: "pending",
    });
  });

  it("never stores an encrypted empty string for a missing verdict", async () => {
    const { POST } = await import("./route");
    await POST(request({ rows: [row("https://example.com/plain", { verdict: "" })] }));

    const inserted = mocks.upsertSpy.mock.calls[0][0][0] as Record<string, unknown>;
    expect(inserted.verdict).toBeNull();
  });

  it("dates a done row that arrived without a timestamp", async () => {
    const { POST } = await import("./route");
    await POST(
      request({
        rows: [
          row("https://example.com/archived", {
            status: "done",
            done_at: null,
            created_at_hint: "2024-03-02T00:00:00.000Z",
          }),
        ],
      }),
    );

    const inserted = mocks.upsertSpy.mock.calls[0][0][0] as Record<string, unknown>;
    expect(inserted.done_at).toBe("2024-03-02T00:00:00.000Z");
  });

  it("isolates a failed chunk: the other chunks still land", async () => {
    const { POST } = await import("./route");
    // 150 rows => two chunks of 100 and 50; fail the first.
    mocks.upsertErrors.push({ message: "network reset" });
    const rows = Array.from({ length: 150 }, (_, i) => row(`https://example.com/${i}`));

    const res = await POST(request({ rows }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failed).toBe(100);
    expect(body.inserted).toBe(50);
    expect(body.rejected).toEqual([
      expect.objectContaining({ reason: "insert_failed" }),
    ]);
  });

  it("degrades with a clear error when the 'import' enum value is not applied", async () => {
    mocks.upsertErrors.push({
      message: 'invalid input value for enum item_source: "import"',
    });

    const { POST } = await import("./route");
    const res = await POST(request({ rows: [row("https://example.com/a")] }));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("import_source_unavailable");
    expect(body.message).toContain("20260725160000_item_source_import.sql");
  });

  it("rejects a body without a rows array", async () => {
    const { POST } = await import("./route");
    const res = await POST(request({ rows: "everything" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ code: "invalid_body" });
  });
});

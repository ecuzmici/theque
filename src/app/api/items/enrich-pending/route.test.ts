import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = {
  id: string;
  user_id: string;
  processing_status: "pending" | "processing" | "ready" | "failed";
  updated_at: string;
  enrichment_attempts: number;
};

const mocks = vi.hoisted(() => ({
  getSessionUserOrNull: vi.fn(),
  rateLimit: vi.fn(),
  enrichItem: vi.fn(),
  rpcSpy: vi.fn(),
  rows: [] as Row[],
}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserOrNull: mocks.getSessionUserOrNull,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
}));

vi.mock("@/lib/jobs/enrich-item", () => ({
  enrichItem: mocks.enrichItem,
}));

/**
 * A fake `items` table with just enough PostgREST surface for this route, plus
 * an RPC that reproduces what `for update skip locked` guarantees: the claim is
 * decided in one uninterrupted step, so no two callers can be handed the same
 * row. Everything the route does about *scoping* is therefore exercised for
 * real — this stub honours `target_user` and `user_id` rather than assuming it.
 */
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      mocks.rpcSpy(fn, args);
      if (fn !== "claim_pending_enrichment_items") throw new Error(`Unexpected rpc ${fn}`);
      const targetUser = args.target_user as string | undefined;
      const batchSize = args.batch_size as number;
      // Synchronous start-to-finish: the atomicity the real function gets from
      // `skip locked`, the fake gets from the JS event loop.
      const claimed = mocks.rows
        .filter(
          (row) =>
            row.processing_status === "pending" &&
            (targetUser === undefined || row.user_id === targetUser),
        )
        .slice(0, batchSize);
      for (const row of claimed) row.processing_status = "processing";
      return Promise.resolve({ data: claimed.map((row) => row.id), error: null });
    },
    from: (table: string) => {
      if (table !== "items") throw new Error(`Unexpected table ${table}`);
      return itemsChain();
    },
  }),
}));

function itemsChain() {
  const filters: { column: string; op: "eq" | "in" | "lt" | "gte"; value: unknown }[] = [];
  let operation: "select" | "update" = "select";
  let patch: Partial<Row> = {};

  const chain: Record<string, unknown> = {
    select: () => chain,
    update: (next: Partial<Row>) => {
      operation = "update";
      patch = next;
      return chain;
    },
    eq: (column: string, value: unknown) => {
      filters.push({ column, op: "eq", value });
      return chain;
    },
    in: (column: string, value: unknown) => {
      filters.push({ column, op: "in", value });
      return chain;
    },
    lt: (column: string, value: unknown) => {
      filters.push({ column, op: "lt", value });
      return chain;
    },
    gte: (column: string, value: unknown) => {
      filters.push({ column, op: "gte", value });
      return chain;
    },
    then: (resolve: (value: { count?: number; error: null }) => void) => {
      const matched = mocks.rows.filter((row) =>
        filters.every((filter) => {
          const actual = row[filter.column as keyof Row];
          if (filter.op === "eq") return actual === filter.value;
          if (filter.op === "in") return (filter.value as unknown[]).includes(actual);
          if (filter.op === "lt") return String(actual) < String(filter.value);
          return Number(actual) >= Number(filter.value);
        }),
      );
      if (operation === "update") {
        for (const row of matched) Object.assign(row, patch);
        resolve({ error: null });
        return;
      }
      resolve({ count: matched.length, error: null });
    },
  };

  return chain;
}

function seed(rows: Partial<Row>[]) {
  mocks.rows.length = 0;
  rows.forEach((row, index) => {
    mocks.rows.push({
      id: row.id ?? `item-${index}`,
      user_id: row.user_id ?? "user-1",
      processing_status: row.processing_status ?? "pending",
      updated_at: row.updated_at ?? new Date().toISOString(),
      enrichment_attempts: row.enrichment_attempts ?? 0,
    });
  });
}

function pendingRows(userId: string, count: number, prefix = "u1"): Partial<Row>[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    user_id: userId,
  }));
}

describe("POST /api/items/enrich-pending", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSessionUserOrNull.mockReset();
    mocks.rateLimit.mockReset();
    mocks.enrichItem.mockReset();
    mocks.rpcSpy.mockReset();
    mocks.rows.length = 0;

    mocks.getSessionUserOrNull.mockResolvedValue({ id: "user-1" });
    mocks.rateLimit.mockResolvedValue({ ok: true });
    // Standing in for a successful enrichment: the row leaves the queue.
    mocks.enrichItem.mockImplementation(async (id: string) => {
      const row = mocks.rows.find((candidate) => candidate.id === id);
      if (row) row.processing_status = "ready";
      return "ready";
    });
  });

  it("requires a session", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(null);
    seed(pendingRows("user-1", 3));

    const { POST } = await import("./route");
    const res = await POST();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ code: "unauthorized" });
    expect(mocks.rpcSpy).not.toHaveBeenCalled();
    expect(mocks.enrichItem).not.toHaveBeenCalled();
  });

  it("rate-limits on its own bucket before claiming anything", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 17 });
    seed(pendingRows("user-1", 3));

    const { POST } = await import("./route");
    const res = await POST();

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("17");
    expect(mocks.rateLimit).toHaveBeenCalledWith("enrich-pending:user-1", 20, 60);
    expect(mocks.rpcSpy).not.toHaveBeenCalled();
    // Nothing was touched, so a 429 costs the user nothing but the round trip.
    expect(mocks.rows.every((row) => row.processing_status === "pending")).toBe(true);
  });

  it("claims a bounded batch scoped to the caller", async () => {
    seed(pendingRows("user-1", 20));

    const { POST } = await import("./route");
    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.claimed).toBe(6);
    expect(body.processed).toBe(6);
    expect(body.remaining).toBe(14);
    expect(mocks.enrichItem).toHaveBeenCalledTimes(6);
    expect(mocks.rpcSpy).toHaveBeenCalledWith("claim_pending_enrichment_items", {
      batch_size: 6,
      per_user_cap: 6,
      target_user: "user-1",
    });
  });

  it("never touches another user's rows", async () => {
    seed([...pendingRows("user-1", 2), ...pendingRows("user-2", 10, "u2")]);

    const { POST } = await import("./route");
    const res = await POST();

    const body = await res.json();
    expect(body.claimed).toBe(2);
    // Their backlog is untouched, and it is not counted as ours either.
    expect(body.remaining).toBe(0);
    expect(mocks.rows.filter((row) => row.user_id === "user-2")).toHaveLength(10);
    expect(
      mocks.rows.every((row) => row.user_id !== "user-2" || row.processing_status === "pending"),
    ).toBe(true);
    const enriched = mocks.enrichItem.mock.calls.map((call) => call[0] as string);
    expect(enriched.every((id) => id.startsWith("u1-"))).toBe(true);
  });

  it("reports the remaining count so a client can drive a progress bar", async () => {
    seed(pendingRows("user-1", 9));

    const { POST } = await import("./route");

    const first = await (await POST()).json();
    expect(first).toMatchObject({ claimed: 6, processed: 6, failed: 0, remaining: 3 });

    const second = await (await POST()).json();
    expect(second).toMatchObject({ claimed: 3, processed: 3, remaining: 0 });

    const third = await (await POST()).json();
    expect(third).toMatchObject({ claimed: 0, processed: 0, remaining: 0 });
  });

  it("counts a terminal failure as failed and drops it from the backlog", async () => {
    seed(pendingRows("user-1", 2));
    mocks.enrichItem.mockImplementation(async (id: string) => {
      const row = mocks.rows.find((candidate) => candidate.id === id);
      if (row) row.processing_status = "failed";
      return "failed";
    });

    const { POST } = await import("./route");
    const body = await (await POST()).json();

    expect(body).toMatchObject({ claimed: 2, processed: 0, failed: 2, remaining: 0 });
  });

  it("two concurrent calls never claim the same row", async () => {
    seed(pendingRows("user-1", 8));

    const { POST } = await import("./route");
    const [a, b] = await Promise.all([POST(), POST()]);
    const [bodyA, bodyB] = await Promise.all([a.json(), b.json()]);

    expect(bodyA.claimed + bodyB.claimed).toBe(8);
    const enriched = mocks.enrichItem.mock.calls.map((call) => call[0] as string);
    expect(enriched).toHaveLength(8);
    expect(new Set(enriched).size).toBe(8);
    expect(mocks.rows.every((row) => row.processing_status === "ready")).toBe(true);
  });

  it("recovers rows stranded by a closed tab before giving up", async () => {
    // What a killed request leaves behind: claimed, never finished, gone stale.
    seed([
      {
        id: "stranded",
        user_id: "user-1",
        processing_status: "processing",
        updated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ]);

    const { POST } = await import("./route");
    const body = await (await POST()).json();

    expect(body).toMatchObject({ claimed: 1, processed: 1, remaining: 0 });
    // First claim came back empty, so the stale sweep ran and the claim retried.
    expect(mocks.rpcSpy).toHaveBeenCalledTimes(2);
  });

  it("does not sweep when there is work to claim", async () => {
    seed(pendingRows("user-1", 1));

    const { POST } = await import("./route");
    await POST();

    expect(mocks.rpcSpy).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/items/enrich-pending", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSessionUserOrNull.mockReset();
    mocks.rateLimit.mockReset();
    mocks.enrichItem.mockReset();
    mocks.rpcSpy.mockReset();
    mocks.rows.length = 0;

    mocks.getSessionUserOrNull.mockResolvedValue({ id: "user-1" });
    mocks.rateLimit.mockResolvedValue({ ok: true });
  });

  it("requires a session", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(null);

    const { GET } = await import("./route");
    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("reports this user's backlog without enriching anything", async () => {
    seed([...pendingRows("user-1", 4), ...pendingRows("user-2", 3, "u2")]);

    const { GET } = await import("./route");
    const res = await GET();

    await expect(res.json()).resolves.toEqual({
      claimed: 0,
      processed: 0,
      failed: 0,
      remaining: 4,
    });
    expect(mocks.rpcSpy).not.toHaveBeenCalled();
    expect(mocks.enrichItem).not.toHaveBeenCalled();
    expect(mocks.rateLimit).toHaveBeenCalledWith("enrich-pending-status:user-1", 30, 60);
  });
});

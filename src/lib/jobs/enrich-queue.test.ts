import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  enrichItem: vi.fn(),
}));

vi.mock("@/lib/jobs/enrich-item", () => ({
  enrichItem: mocks.enrichItem,
}));

import {
  claimPendingEnrichmentItems,
  countPendingForUser,
  enrichBatchSize,
  enrichConcurrency,
  enrichPerUserCap,
  requeueStaleProcessing,
  runEnrichBatch,
} from "./enrich-queue";

type Call = { method: string; args: unknown[] };

/**
 * Minimal PostgREST-shaped stub: records the chained calls so a test can assert
 * *which* rows a statement was scoped to, and resolves to `{ error: null }`.
 */
function queryChain(calls: Call[], result: unknown = { error: null }) {
  const chain: Record<string, unknown> = {};
  for (const method of ["update", "select", "eq", "in", "lt", "gte"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => void) => resolve(result);
  return chain;
}

function adminStub(options: { calls?: Call[]; rpc?: ReturnType<typeof vi.fn>; result?: unknown }) {
  const calls = options.calls ?? [];
  return {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return queryChain(calls, options.result);
    },
    rpc: options.rpc ?? vi.fn().mockResolvedValue({ data: [], error: null }),
  } as never;
}

describe("enrich-queue configuration", () => {
  const original = {
    batch: process.env.ENRICH_BATCH_SIZE,
    cap: process.env.ENRICH_PER_USER_CAP,
    concurrency: process.env.ENRICH_CONCURRENCY,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries({
      ENRICH_BATCH_SIZE: original.batch,
      ENRICH_PER_USER_CAP: original.cap,
      ENRICH_CONCURRENCY: original.concurrency,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("defaults to a batch that actually drains, with a per-user cap that stays fair", () => {
    delete process.env.ENRICH_BATCH_SIZE;
    delete process.env.ENRICH_PER_USER_CAP;
    delete process.env.ENRICH_CONCURRENCY;

    expect(enrichBatchSize()).toBe(60);
    expect(enrichPerUserCap()).toBe(20);
    expect(enrichConcurrency()).toBe(3);
    // The cap has to stay well under the batch or it stops being a fairness knob.
    expect(enrichPerUserCap()).toBeLessThan(enrichBatchSize());
  });

  it("reads overrides from the environment and ignores nonsense", () => {
    process.env.ENRICH_BATCH_SIZE = "40";
    process.env.ENRICH_PER_USER_CAP = "0";
    process.env.ENRICH_CONCURRENCY = "not-a-number";

    expect(enrichBatchSize()).toBe(40);
    expect(enrichPerUserCap()).toBe(20);
    expect(enrichConcurrency()).toBe(3);
  });

  it("clamps absurd values so one env typo cannot melt the function", () => {
    process.env.ENRICH_BATCH_SIZE = "100000";
    process.env.ENRICH_CONCURRENCY = "500";

    expect(enrichBatchSize()).toBe(500);
    expect(enrichConcurrency()).toBe(10);
  });
});

describe("claimPendingEnrichmentItems", () => {
  it("scopes the claim to one user when a target is given", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: ["a", "b"], error: null });

    const result = await claimPendingEnrichmentItems(adminStub({ rpc }), {
      batchSize: 6,
      perUserCap: 6,
      targetUser: "user-1",
    });

    expect(rpc).toHaveBeenCalledWith("claim_pending_enrichment_items", {
      batch_size: 6,
      per_user_cap: 6,
      target_user: "user-1",
    });
    expect(result).toEqual({ ids: ["a", "b"], error: null });
  });

  it("omits target_user for shared runs", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    const result = await claimPendingEnrichmentItems(adminStub({ rpc }), {
      batchSize: 60,
      perUserCap: 20,
    });

    expect(rpc).toHaveBeenCalledWith("claim_pending_enrichment_items", {
      batch_size: 60,
      per_user_cap: 20,
    });
    expect(result.ids).toEqual([]);
  });

  it("surfaces the claim error instead of pretending the queue is empty", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "deadlock" } });

    const result = await claimPendingEnrichmentItems(adminStub({ rpc }), {
      batchSize: 6,
      perUserCap: 6,
    });

    expect(result).toEqual({ ids: [], error: "deadlock" });
  });
});

describe("runEnrichBatch", () => {
  beforeEach(() => {
    mocks.enrichItem.mockReset();
  });

  it("counts ready and failed outcomes and releases nothing when it finishes", async () => {
    mocks.enrichItem
      .mockResolvedValueOnce("ready")
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("pending_retry");
    const calls: Call[] = [];

    const result = await runEnrichBatch(adminStub({ calls }), ["a", "b", "c"], {
      budgetMs: 60_000,
      concurrency: 1,
    });

    expect(result).toEqual({ processed: 1, failed: 1, released: 0 });
    expect(calls.some((call) => call.method === "update")).toBe(false);
  });

  it("stops starting work when the budget runs out and hands the rest back", async () => {
    mocks.enrichItem.mockResolvedValue("ready");
    const calls: Call[] = [];
    let clock = 0;
    // Every tick of the fake clock is 10s; the budget allows one item.
    const now = () => (clock += 10_000);

    const result = await runEnrichBatch(adminStub({ calls }), ["a", "b", "c", "d"], {
      budgetMs: 5_000,
      concurrency: 1,
      now,
    });

    expect(result.processed).toBe(1);
    expect(result.released).toBe(3);
    expect(mocks.enrichItem).toHaveBeenCalledTimes(1);
    // Released rows go back to `pending`, and only if we still hold them.
    expect(calls).toContainEqual({ method: "update", args: [{ processing_status: "pending" }] });
    expect(calls).toContainEqual({ method: "in", args: ["id", ["b", "c", "d"]] });
    expect(calls).toContainEqual({ method: "eq", args: ["processing_status", "processing"] });
  });

  it("always processes at least one item even with a spent budget", async () => {
    mocks.enrichItem.mockResolvedValue("ready");

    const result = await runEnrichBatch(adminStub({}), ["a", "b"], {
      budgetMs: 0,
      concurrency: 1,
      now: () => 10_000,
    });

    expect(result.processed).toBe(1);
    expect(result.released).toBe(1);
  });

  it("never enriches an item twice within a batch", async () => {
    mocks.enrichItem.mockResolvedValue("ready");
    const ids = ["a", "b", "c", "d", "e"];

    const result = await runEnrichBatch(adminStub({}), ids, {
      budgetMs: 60_000,
      concurrency: 3,
    });

    expect(result.processed).toBe(5);
    const seen = mocks.enrichItem.mock.calls.map((call) => call[0]);
    expect(new Set(seen).size).toBe(ids.length);
  });

  it("keeps going when one item throws outright", async () => {
    mocks.enrichItem
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce("ready");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runEnrichBatch(adminStub({}), ["a", "b"], {
      budgetMs: 60_000,
      concurrency: 1,
    });

    expect(result).toEqual({ processed: 1, failed: 1, released: 0 });
    spy.mockRestore();
  });
});

describe("requeueStaleProcessing", () => {
  it("sweeps every library when no user is given", async () => {
    const calls: Call[] = [];

    await requeueStaleProcessing(adminStub({ calls }));

    expect(calls.filter((call) => call.method === "update")).toHaveLength(2);
    expect(calls.some((call) => call.method === "eq" && call.args[0] === "user_id")).toBe(false);
  });

  it("scopes the sweep to one library when a user is given", async () => {
    const calls: Call[] = [];

    await requeueStaleProcessing(adminStub({ calls }), "user-1");

    const userScoped = calls.filter(
      (call) => call.method === "eq" && call.args[0] === "user_id" && call.args[1] === "user-1",
    );
    // Both statements — the give-up and the requeue — stay inside the library.
    expect(userScoped).toHaveLength(2);
  });
});

describe("countPendingForUser", () => {
  it("counts only this user's pending rows", async () => {
    const calls: Call[] = [];
    const admin = adminStub({ calls, result: { count: 7, error: null } });

    await expect(countPendingForUser(admin, "user-1")).resolves.toBe(7);
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
    expect(calls).toContainEqual({ method: "eq", args: ["processing_status", "pending"] });
  });

  it("returns null when the count fails rather than reporting a bogus zero", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = adminStub({ result: { count: null, error: { message: "timeout" } } });

    await expect(countPendingForUser(admin, "user-1")).resolves.toBeNull();
    spy.mockRestore();
  });
});

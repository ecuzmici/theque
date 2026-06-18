import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const enrichItem = vi.fn();
  const rpc = vi.fn();
  const from = vi.fn();
  const update = vi.fn();

  return {
    enrichItem,
    rpc,
    from,
    update,
  };
});

vi.mock("@/lib/jobs/enrich-item", () => ({
  enrichItem: mocks.enrichItem,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: mocks.from,
  }),
}));

describe("/api/jobs/enrich", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    mocks.enrichItem.mockReset();
    mocks.rpc.mockReset();
    mocks.from.mockReset();
    mocks.update.mockReset();

    // Chainable query builder that resolves to { error: null } when awaited.
    const chain: Record<string, unknown> = {
      update: (...args: unknown[]) => {
        mocks.update(...args);
        return chain;
      },
      eq: () => chain,
      lt: () => chain,
      gte: () => chain,
      then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
    };
    mocks.from.mockReturnValue(chain);

    process.env.CRON_SECRET = "cron-test-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret;
  });

  it("allows Vercel cron GET requests to process pending items", async () => {
    mocks.rpc.mockResolvedValue({
      data: ["item-1", "item-2"],
      error: null,
    });
    mocks.enrichItem.mockResolvedValueOnce("ready").mockResolvedValueOnce("failed");

    const { GET } = await import("./route");

    const res = await GET(
      new Request("https://theque.app/api/jobs/enrich", {
        headers: {
          Authorization: "Bearer cron-test-secret",
        },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ processed: 1, failed: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("claim_pending_enrichment_items", {
      batch_size: 10,
      per_user_cap: 3,
    });
    expect(mocks.enrichItem).toHaveBeenNthCalledWith(1, "item-1");
    expect(mocks.enrichItem).toHaveBeenNthCalledWith(2, "item-2");
  });

  it("requeues stale processing items before claiming", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    const { POST } = await import("./route");

    await POST(
      new Request("https://theque.app/api/jobs/enrich", {
        method: "POST",
        headers: { Authorization: "Bearer cron-test-secret" },
      }),
    );

    expect(mocks.from).toHaveBeenCalledWith("items");
    // Stale rows already at the attempt cap are failed; the rest are requeued.
    expect(mocks.update).toHaveBeenCalledWith({
      processing_status: "failed",
      enrichment_error: "stale_processing",
    });
    expect(mocks.update).toHaveBeenCalledWith({ processing_status: "pending" });
  });
});

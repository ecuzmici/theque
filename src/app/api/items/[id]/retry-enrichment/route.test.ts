import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getSessionUserOrNull = vi.fn();
  const enrichItem = vi.fn();
  const afterResults: unknown[] = [];
  const select = vi.fn();
  const eq = vi.fn();
  const update = vi.fn();
  const from = vi.fn();

  return {
    getSessionUserOrNull,
    enrichItem,
    afterResults,
    select,
    eq,
    update,
    from,
  };
});

vi.mock("next/server", () => ({
  after: (callback: () => unknown) => {
    mocks.afterResults.push(callback());
  },
}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserOrNull: mocks.getSessionUserOrNull,
}));

vi.mock("@/lib/jobs/enrich-item", () => ({
  enrichItem: mocks.enrichItem,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: mocks.from,
  }),
}));

describe("POST /api/items/[id]/retry-enrichment", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSessionUserOrNull.mockReset();
    mocks.enrichItem.mockReset();
    mocks.afterResults.length = 0;
    mocks.select.mockReset();
    mocks.eq.mockReset();
    mocks.update.mockReset();
    mocks.from.mockReset();
  });

  it("returns the enrichment promise from the after callback", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue({ id: "user-1" });
    mocks.select.mockResolvedValue({ data: [{ id: "item-1" }], error: null });
    mocks.eq.mockReturnValue({ eq: mocks.eq, select: mocks.select });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ update: mocks.update });
    let resolveEnrichment!: (value: string) => void;
    const enrichmentPromise = new Promise<string>((resolve) => {
      resolveEnrichment = resolve;
    });
    mocks.enrichItem.mockReturnValue(enrichmentPromise);

    const { POST } = await import("./route");

    const res = await POST(new Request("https://theque.app/api/items/item-1/retry-enrichment"), {
      params: Promise.resolve({ id: "item-1" }),
    });

    expect(res.status).toBe(202);
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
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getSessionUserOrNull: vi.fn(),
  rateLimit: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/auth/session-user", () => ({ getSessionUserOrNull: mocks.getSessionUserOrNull }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/lib/enrichment/llm/gemini-item-rewriter", () => ({ rewriteItemWithGemini: vi.fn() }));
vi.mock("@/lib/enrichment/fetch", () => ({ fetchPage: vi.fn() }));

function call() {
  return import("./route").then(({ POST }) =>
    POST(new Request("https://theque.app/api/items/item-1/ai-enrichment-proposal", { method: "POST" }), {
      params: Promise.resolve({ id: "item-1" }),
    }),
  );
}

describe("POST /api/items/[id]/ai-enrichment-proposal limits", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSessionUserOrNull.mockResolvedValue({ id: "user-1" });
    mocks.rateLimit.mockReset();
    mocks.from.mockReset();
  });

  it("answers 429 when the daily limit is reached", async () => {
    mocks.rateLimit.mockImplementation(async (key: string) => ({ ok: !key.startsWith("ai-proposal-day:") }));

    const res = await call();

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ code: "daily_limit_reached" });
    expect(mocks.rateLimit).toHaveBeenCalledWith("ai-proposal-day:user-1", 30, 86400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

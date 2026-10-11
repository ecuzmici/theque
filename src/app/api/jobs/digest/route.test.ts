// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const eqCalls: Array<[string, unknown]> = [];
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return chain;
    }),
    lt: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data: [], error: null })),
  };
  return { chain, eqCalls, from: vi.fn(() => chain) };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));

function request() {
  return new Request("https://theque.app/api/jobs/digest", {
    headers: { authorization: "Bearer cron-secret" },
  });
}

describe("GET /api/jobs/digest", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.eqCalls.length = 0;
    mocks.from.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers 503 and reads nothing without DIGEST_USER_ID", async () => {
    vi.stubEnv("DIGEST_USER_ID", "");
    const { GET } = await import("./route");

    const res = await GET(request());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: "digest_not_configured" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("reads the items of DIGEST_USER_ID only", async () => {
    vi.stubEnv("DIGEST_USER_ID", "user-1");
    const { GET } = await import("./route");

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(mocks.eqCalls).toContainEqual(["user_id", "user-1"]);
  });
});

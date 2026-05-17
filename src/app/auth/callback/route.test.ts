import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const exchangeCodeForSession = vi.fn();
  const verifyOtp = vi.fn();
  const setAll = vi.fn();

  return {
    exchangeCodeForSession,
    verifyOtp,
    setAll,
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: typeof mocks.setAll } }) => {
    mocks.setAll = options.cookies.setAll;
    return {
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        verifyOtp: mocks.verifyOtp,
      },
    };
  },
}));

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.exchangeCodeForSession.mockReset();
    mocks.verifyOtp.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("verifies Supabase email confirmation token hashes", async () => {
    mocks.verifyOtp.mockImplementation(async () => {
      mocks.setAll([{ name: "sb-session", value: "session", options: { path: "/" } }], {
        "cache-control": "no-store",
      });
      return { error: null };
    });

    const { GET } = await import("./route");

    const res = await GET(
      new Request("https://theque.app/auth/callback?next=%2Flibrary&token_hash=hashed-token&type=email"),
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hashed-token",
      type: "email",
    });
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://theque.app/library");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toContain("sb-session=session");
  });

  it("keeps exchanging OAuth codes for existing callback links", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });

    const { GET } = await import("./route");

    const res = await GET(new Request("https://theque.app/auth/callback?next=%2Fsettings&code=oauth-code"));

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://theque.app/settings");
  });
});

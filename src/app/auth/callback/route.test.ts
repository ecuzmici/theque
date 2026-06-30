import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const exchangeCodeForSession = vi.fn();
  const setAll = vi.fn();

  return {
    exchangeCodeForSession,
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
      },
    };
  },
}));

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.exchangeCodeForSession.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("exchanges OAuth codes for a session and sets cookies", async () => {
    mocks.exchangeCodeForSession.mockImplementation(async () => {
      mocks.setAll([{ name: "sb-session", value: "session", options: { path: "/" } }], {
        "cache-control": "no-store",
      });
      return { error: null };
    });

    const { GET } = await import("./route");

    const res = await GET(new Request("https://theque.app/auth/callback?next=%2Fsettings&code=oauth-code"));

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
    expect(res.headers.get("location")).toBe("https://theque.app/settings");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toContain("sb-session=session");
  });

  it("redirects to login with the provider error when OAuth fails", async () => {
    const { GET } = await import("./route");

    const res = await GET(
      new Request("https://theque.app/auth/callback?error=access_denied&error_description=denied"),
    );

    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://theque.app/login?error=auth&reason=access_denied");
  });

  it("redirects to login when no code is present", async () => {
    const { GET } = await import("./route");

    const res = await GET(new Request("https://theque.app/auth/callback?next=%2Flibrary"));

    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://theque.app/login?error=auth&reason=missing_code");
  });

  it("sanitizes the next path before redirecting", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });

    const { GET } = await import("./route");

    const res = await GET(
      new Request("https://theque.app/auth/callback?next=https%3A%2F%2Fevil.example&code=oauth-code"),
    );

    expect(res.headers.get("location")).toBe("https://theque.app/library");
  });
});

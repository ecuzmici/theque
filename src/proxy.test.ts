// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims } }),
}));

describe("proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("derives all Supabase auth cookie names that can hold stale sessions", async () => {
    const { getSupabaseAuthCookieNames } = await import("./proxy");

    expect(getSupabaseAuthCookieNames("https://project-ref.supabase.co")).toEqual([
      "sb-project-ref-auth-token",
      "sb-project-ref-auth-token.0",
      "sb-project-ref-auth-token.1",
      "sb-project-ref-auth-token-code-verifier",
    ]);
  });

  it("sends a signed-in user with a tab-smuggled next to the library", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    const { proxy } = await import("./proxy");

    const res = await proxy(new NextRequest("https://theque.app/login?next=/%09/evil.com"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://theque.app/library");
  });

  it("sends a guest on a protected path to login with the return path", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    getClaims.mockResolvedValue({ data: null, error: null });
    const { proxy } = await import("./proxy");

    const res = await proxy(new NextRequest("https://theque.app/item/abc?x=1"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://theque.app/login?next=%2Fitem%2Fabc%3Fx%3D1",
    );
  });

  it("expires the auth cookies when the JWT check fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    getClaims.mockResolvedValue({ data: null, error: new Error("Invalid JWT signature") });
    const { proxy } = await import("./proxy");

    const res = await proxy(new NextRequest("https://theque.app/library"));

    expect(res.status).toBe(307);
    expect(res.headers.get("set-cookie")).toContain("sb-project-ref-auth-token=;");
  });
});

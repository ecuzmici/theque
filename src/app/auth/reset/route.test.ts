import { beforeEach, describe, expect, it } from "vitest";

describe("GET /auth/reset", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project-ref.supabase.co";
  });

  it("clears browser auth state and redirects to login", async () => {
    const { GET } = await import("./route");

    const res = await GET(new Request("https://theque.app/auth/reset?next=%2Fsettings"));
    const html = await res.text();
    const setCookie = res.headers.get("set-cookie") ?? "";

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(html).toContain("localStorage.clear()");
    expect(html).toContain("sessionStorage.clear()");
    expect(html).toContain('window.location.replace("https://theque.app/login?next=%2Fsettings&reset=1")');
    expect(res.headers.get("clear-site-data")).toBe('"cache", "cookies", "storage"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(setCookie).toContain("sb-project-ref-auth-token=");
    expect(setCookie).toContain("sb-project-ref-auth-token.0=");
    expect(setCookie).toContain("sb-project-ref-auth-token.1=");
    expect(setCookie).toContain("sb-project-ref-auth-token-code-verifier=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("falls back to the library redirect target for unsafe next values", async () => {
    const { GET } = await import("./route");

    const res = await GET(new Request("https://theque.app/auth/reset?next=https%3A%2F%2Fevil.example"));
    const html = await res.text();

    expect(html).toContain('window.location.replace("https://theque.app/login?next=%2Flibrary&reset=1")');
  });
});

import { describe, expect, it } from "vitest";

describe("middleware", () => {
  it("derives all Supabase auth cookie names that can hold stale sessions", async () => {
    const { getSupabaseAuthCookieNames } = await import("./middleware");

    expect(getSupabaseAuthCookieNames("https://project-ref.supabase.co")).toEqual([
      "sb-project-ref-auth-token",
      "sb-project-ref-auth-token.0",
      "sb-project-ref-auth-token.1",
      "sb-project-ref-auth-token-code-verifier",
    ]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

async function loadCspHeader(nodeEnv: string) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");

  const { default: nextConfig } = await import("./next.config");
  const headerRules = await nextConfig.headers?.();
  const cspHeader = headerRules?.[0]?.headers.find(
    (header) => header.key === "Content-Security-Policy",
  );

  return cspHeader?.value ?? "";
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("security headers", () => {
  it("allows React development eval while running the dev server", async () => {
    await expect(loadCspHeader("development")).resolves.toContain("'unsafe-eval'");
  });

  it("does not allow eval in production CSP", async () => {
    await expect(loadCspHeader("production")).resolves.not.toContain("'unsafe-eval'");
  });

  it("allows Supabase Realtime websocket connections", async () => {
    await expect(loadCspHeader("production")).resolves.toContain(
      "wss://example.supabase.co",
    );
  });
});

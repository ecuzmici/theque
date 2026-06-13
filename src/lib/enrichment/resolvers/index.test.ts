import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CategoryResolver } from "@/lib/enrichment/resolvers/types";
import { runResolvers } from "@/lib/enrichment/resolvers/index";

const ok: CategoryResolver = async () => ({ source: "ok", structured: { year: 2008 } });
const miss: CategoryResolver = async () => null;
const boom: CategoryResolver = async () => {
  throw new Error("network");
};

const input = { canonicalUrl: "https://example.com", title: "X", structured: {} };

describe("runResolvers", () => {
  it("returns the first non-null patch", async () => {
    const patch = await runResolvers([miss, ok], input);
    expect(patch).toEqual({ source: "ok", structured: { year: 2008 } });
  });

  it("returns null when every resolver misses", async () => {
    expect(await runResolvers([miss, miss], input)).toBeNull();
  });

  it("swallows a throwing resolver and continues", async () => {
    const patch = await runResolvers([boom, ok], input);
    expect(patch?.source).toBe("ok");
  });

  it("returns null for an empty resolver list", async () => {
    expect(await runResolvers([], input)).toBeNull();
  });
});

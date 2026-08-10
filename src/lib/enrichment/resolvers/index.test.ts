import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CategoryResolver } from "@/lib/enrichment/resolvers/types";
import { runResolvers, runResolversMerged } from "@/lib/enrichment/resolvers/index";

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

const rich: CategoryResolver = async () => ({
  source: "hardcover",
  title: "Piranesi",
  structured: { genres: ["Fantasy"], series: "None", page_count: 245 },
});
const sparse: CategoryResolver = async () => ({
  source: "google_books",
  description: "A fallback blurb.",
  structured: { published_year: 2020, page_count: 999 },
});

describe("runResolversMerged", () => {
  it("lets the earlier resolver win each shared field", async () => {
    const patch = await runResolversMerged([rich, sparse], input);
    expect(patch?.structured?.page_count).toBe(245);
  });

  it("fills gaps from the later resolver", async () => {
    const patch = await runResolversMerged([rich, sparse], input);
    expect(patch?.structured?.published_year).toBe(2020);
    expect(patch?.description).toBe("A fallback blurb.");
  });

  it("joins the contributing sources", async () => {
    const patch = await runResolversMerged([rich, sparse], input);
    expect(patch?.source).toBe("hardcover+google_books");
  });

  it("returns the single patch unchanged when only one resolver hits", async () => {
    const patch = await runResolversMerged([miss, ok], input);
    expect(patch).toEqual({ source: "ok", structured: { year: 2008 } });
  });

  it("returns null when every resolver misses", async () => {
    expect(await runResolversMerged([miss, miss], input)).toBeNull();
  });

  it("swallows a throwing resolver and keeps the rest", async () => {
    const patch = await runResolversMerged([boom, ok], input);
    expect(patch?.source).toBe("ok");
  });
});

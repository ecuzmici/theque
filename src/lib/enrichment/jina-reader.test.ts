import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchViaJinaReader } from "@/lib/enrichment/jina-reader";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.stubEnv("JINA_READER_ENABLED", "true");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchViaJinaReader", () => {
  it("returns null when the flag is off", async () => {
    vi.stubEnv("JINA_READER_ENABLED", "false");
    expect(await fetchViaJinaReader("https://example.com/x")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches r.jina.ai and returns markdown + parsed title", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "Title: Selva — Lisbon\n\nA tasting-menu restaurant in Lisbon.",
    });

    const result = await fetchViaJinaReader("https://selva-lisboa.com/");

    expect(fetchMock.mock.calls[0][0].toString()).toBe("https://r.jina.ai/https://selva-lisboa.com/");
    expect(result?.title).toBe("Selva — Lisbon");
    expect(result?.markdown).toContain("tasting-menu restaurant");
  });

  it("caps markdown at MAX_PAGE_TEXT_CHARS", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "x".repeat(20000) });
    const result = await fetchViaJinaReader("https://example.com/x");
    expect((result?.markdown ?? "").length).toBeLessThanOrEqual(4000);
  });

  it("returns null on non-200, empty body, or fetch error", async () => {
    fetchMock.mockResolvedValue({ ok: false, text: async () => "" });
    expect(await fetchViaJinaReader("https://example.com/x")).toBeNull();

    fetchMock.mockResolvedValue({ ok: true, text: async () => "   " });
    expect(await fetchViaJinaReader("https://example.com/x")).toBeNull();

    fetchMock.mockRejectedValue(new Error("net"));
    expect(await fetchViaJinaReader("https://example.com/x")).toBeNull();
  });
});

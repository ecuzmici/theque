import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

import { fetchPage, MAX_FETCH_BYTES } from "./fetch";

describe("fetchPage", () => {
  beforeEach(() => {
    dnsMocks.lookup.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects loopback IP literals before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPage("http://127.0.0.1/latest")).rejects.toThrow("blocked_fetch_url");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects hostnames that resolve to private IP ranges", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    dnsMocks.lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    await expect(fetchPage("https://internal.example/page")).rejects.toThrow("blocked_fetch_url");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates redirect destinations before following them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    dnsMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    await expect(fetchPage("https://example.com/redirect")).rejects.toThrow("blocked_fetch_url");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects responses that exceed the enrichment body size limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(MAX_FETCH_BYTES + 1))));
    dnsMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    await expect(fetchPage("https://example.com/large")).rejects.toThrow("fetch_body_too_large");
  });
});

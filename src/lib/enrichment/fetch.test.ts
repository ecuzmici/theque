import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

import { assertSafeFetchUrl, fetchPage, MAX_FETCH_BYTES } from "./fetch";

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

describe("assertSafeFetchUrl", () => {
  beforeEach(() => {
    dnsMocks.lookup.mockReset();
  });

  it("rejects URLs with embedded username credentials", async () => {
    await expect(assertSafeFetchUrl(new URL("https://user@example.com/page"))).rejects.toThrow(
      "blocked_fetch_url",
    );
  });

  it("rejects URLs with embedded password credentials", async () => {
    await expect(assertSafeFetchUrl(new URL("https://:secret@example.com/page"))).rejects.toThrow(
      "blocked_fetch_url",
    );
  });

  it("rejects IPv6 loopback ::1", async () => {
    await expect(assertSafeFetchUrl(new URL("http://[::1]/"))).rejects.toThrow("blocked_fetch_url");
  });

  it("rejects IPv6 unspecified ::", async () => {
    await expect(assertSafeFetchUrl(new URL("http://[::]/"))).rejects.toThrow("blocked_fetch_url");
  });

  it("rejects IPv6 link-local fe80 addresses", async () => {
    await expect(assertSafeFetchUrl(new URL("http://[fe80::1]/"))).rejects.toThrow(
      "blocked_fetch_url",
    );
  });

  it("rejects IPv4-mapped private range ::ffff:172.16.x", async () => {
    await expect(assertSafeFetchUrl(new URL("http://[::ffff:172.16.0.1]/"))).rejects.toThrow(
      "blocked_fetch_url",
    );
  });

  it("rejects ::ffff:0: mapped range (RFC 6052 NAT64 prefix)", async () => {
    // ::ffff:0:0/96 is the IPv4-mapped range; ::ffff:0:0.0.0.1 maps to 0.0.0.1 but the
    // prefix check covers all ::ffff:0: addresses.
    await expect(assertSafeFetchUrl(new URL("http://[::ffff:0:0.0.0.1]/"))).rejects.toThrow(
      "blocked_fetch_url",
    );
  });

  it("rejects ULA fc::/7 private IPv6", async () => {
    await expect(assertSafeFetchUrl(new URL("http://[fc00::1]/"))).rejects.toThrow(
      "blocked_fetch_url",
    );
  });

  it("rejects ULA fd::/7 private IPv6", async () => {
    await expect(assertSafeFetchUrl(new URL("http://[fd12:3456:789a::1]/"))).rejects.toThrow(
      "blocked_fetch_url",
    );
  });

  it("allows a public hostname that resolves to a public IP", async () => {
    dnsMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(assertSafeFetchUrl(new URL("https://example.com/"))).resolves.toBeUndefined();
  });

  it("rejects non-http/https protocol", async () => {
    await expect(assertSafeFetchUrl(new URL("ftp://example.com/file"))).rejects.toThrow(
      "blocked_fetch_url",
    );
  });
});

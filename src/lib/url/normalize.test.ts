import { describe, expect, it } from "vitest";

import { fingerprint } from "@/lib/url/fingerprint";
import { domainFromCanonicalUrl } from "@/lib/url/domain";
import { normalizeUrl, resolveKnownShortHosts } from "@/lib/url/normalize";

describe("normalizeUrl", () => {
  it("strips utm_* and sorts remaining query keys", () => {
    const out = normalizeUrl(
      "https://Example.COM/path/?utm_source=x&b=2&a=1&utm_medium=email",
    );
    expect(out).toBe("https://example.com/path?a=1&b=2");
  });

  it("removes trailing slash except root", () => {
    expect(normalizeUrl("https://foo.com/bar/")).toBe("https://foo.com/bar");
    expect(normalizeUrl("https://foo.com/")).toBe("https://foo.com/");
  });

  it("forces https", () => {
    expect(normalizeUrl("http://foo.com/a")).toBe("https://foo.com/a");
  });

  it("expands youtu.be stub to youtube watch URL", () => {
    const out = normalizeUrl("https://youtu.be/dQw4w9WgXcQ?t=10&utm_source=share");
    expect(out).toContain("youtube.com/watch");
    expect(out).toContain("v=dQw4w9WgXcQ");
    expect(out).not.toContain("youtu.be");
  });

  it("throws invalid_url for non-http(s)", () => {
    expect(() => normalizeUrl("ftp://x")).toThrow("invalid_url");
  });
});

describe("resolveKnownShortHosts", () => {
  it("returns youtube watch URL for youtu.be", () => {
    const u = resolveKnownShortHosts(new URL("https://youtu.be/abc123"));
    expect(u.hostname).toBe("www.youtube.com");
    expect(u.searchParams.get("v")).toBe("abc123");
  });
});

describe("fingerprint", () => {
  it("is stable SHA-256 hex", () => {
    const a = fingerprint("https://example.com/a");
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint("https://example.com/a")).toBe(a);
    expect(fingerprint("https://example.com/b")).not.toBe(a);
  });
});

describe("domainFromCanonicalUrl", () => {
  it("returns lowercase host", () => {
    expect(domainFromCanonicalUrl("https://WWW.IMDB.COM/title/tt123")).toBe("www.imdb.com");
  });
});

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

describe("normalizeUrl host rules", () => {
  it("drops the query of an IMDb title page", () => {
    expect(normalizeUrl("https://www.imdb.com/title/tt0111161/?ref_=fn_al_tt_1")).toBe(
      "https://www.imdb.com/title/tt0111161",
    );
    expect(normalizeUrl("https://m.imdb.com/title/tt0111161/?ref_=x")).toBe(
      "https://m.imdb.com/title/tt0111161",
    );
  });

  it("keeps the query of an IMDb search page", () => {
    expect(normalizeUrl("https://www.imdb.com/find/?q=dune")).toBe("https://www.imdb.com/find?q=dune");
  });

  it("drops the query of a Goodreads book page", () => {
    expect(
      normalizeUrl("https://www.goodreads.com/book/show/44767458-dune?from_search=true&from_srp=true&qid=x&rank=1"),
    ).toBe("https://www.goodreads.com/book/show/44767458-dune");
  });

  it("rebuilds an Amazon product URL from the ASIN", () => {
    expect(
      normalizeUrl(
        "https://www.amazon.com/Dune-Frank-Herbert/dp/0441172717/ref=sr_1_1?crid=2X&dib=abc&keywords=dune&qid=1&sprefix=dun&sr=8-1",
      ),
    ).toBe("https://www.amazon.com/dp/0441172717");
    expect(normalizeUrl("https://www.amazon.de/gp/product/B08N5WRWNW?psc=1")).toBe(
      "https://www.amazon.de/dp/B08N5WRWNW",
    );
  });

  it("keeps an Amazon URL without an ASIN", () => {
    expect(normalizeUrl("https://www.amazon.com/s?k=dune")).toBe("https://www.amazon.com/s?k=dune");
  });

  it("drops the query of TMDB, Letterboxd, and Open Library entity pages", () => {
    expect(normalizeUrl("https://www.themoviedb.org/movie/438631-dune?language=en-US")).toBe(
      "https://www.themoviedb.org/movie/438631-dune",
    );
    expect(normalizeUrl("https://letterboxd.com/film/dune-2021/?x=1")).toBe(
      "https://letterboxd.com/film/dune-2021",
    );
    expect(normalizeUrl("https://openlibrary.org/works/OL893415W?edition=key")).toBe(
      "https://openlibrary.org/works/OL893415W",
    );
  });

  it("removes the global tracking additions", () => {
    expect(
      normalizeUrl("https://example.com/a?igshid=1&mc_cid=2&_hsenc=3&srsltid=4&gbraid=5&mkt_tok=6&keep=1"),
    ).toBe("https://example.com/a?keep=1");
  });

  it("removes si only on YouTube and Spotify", () => {
    expect(normalizeUrl("https://www.youtube.com/watch?v=abc&si=share")).toBe(
      "https://www.youtube.com/watch?v=abc",
    );
    expect(normalizeUrl("https://open.spotify.com/track/123?si=share")).toBe(
      "https://open.spotify.com/track/123",
    );
    expect(normalizeUrl("https://example.com/a?si=keep")).toBe("https://example.com/a?si=keep");
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

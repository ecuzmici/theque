import { describe, expect, it } from "vitest";

import type { CaptureSnapshot } from "@/lib/capture/capture-snapshot";
import { extractFromHtml } from "@/lib/enrichment/extract";
import { readCaptureSnapshot, snapshotToFetchResult } from "@/lib/enrichment/snapshot-adapter";

const movieSnapshot: CaptureSnapshot = {
  captured_at: "2026-06-13T00:00:00.000Z",
  page_title: "The Dark Knight (2008) - IMDb",
  canonical_url: "https://www.imdb.com/title/tt0468569/",
  meta: [
    { attr: "property", key: "og:title", content: "The Dark Knight (2008) ⭐ 9.0" },
    { attr: "property", key: "og:image", content: "https://m.media-amazon.com/poster.jpg" },
    { attr: "property", key: "og:description", content: "Batman faces the Joker." },
  ],
  json_ld: [
    '{"@context":"https://schema.org","@type":"Movie","name":"The Dark Knight","datePublished":"2008-07-18","director":{"@type":"Person","name":"Christopher Nolan"}}',
  ],
  text: "When the menace known as the Joker wreaks havoc on Gotham City...",
};

describe("snapshotToFetchResult", () => {
  it("produces HTML that the existing extract pipeline can parse", () => {
    const result = snapshotToFetchResult(movieSnapshot, "https://imdb.com/title/tt0468569/");

    expect(result.statusCode).toBe(200);
    expect(result.finalUrl).toBe("https://www.imdb.com/title/tt0468569/");

    const extracted = extractFromHtml(result.html, {
      finalUrl: result.finalUrl,
      statusCode: result.statusCode,
    });
    expect(extracted.raw_metadata.open_graph["og:image"]).toBe(
      "https://m.media-amazon.com/poster.jpg",
    );
    expect(extracted.raw_metadata.parser).toBe("imdb");
    expect(extracted.structured.year).toBe(2008);
    expect(extracted.structured.directors).toEqual(["Christopher Nolan"]);
  });

  it("falls back to the item canonical URL when the snapshot has none", () => {
    const result = snapshotToFetchResult(
      { ...movieSnapshot, canonical_url: undefined },
      "https://example.com/fallback",
    );
    expect(result.finalUrl).toBe("https://example.com/fallback");
  });

  it("escapes meta content and neutralizes </script> inside JSON-LD", () => {
    const hostile: CaptureSnapshot = {
      captured_at: "2026-06-13T00:00:00.000Z",
      page_title: 'Evil "Page" <script>',
      meta: [{ attr: "property", key: "og:title", content: '"><script>alert(1)</script>' }],
      json_ld: ['{"name":"</script><script>alert(1)</script>"}'],
    };
    const result = snapshotToFetchResult(hostile, "https://example.com/x");

    // Synthetic HTML must contain no executable script element.
    expect(result.html).not.toMatch(/<script>(?!.*ld\+json)/);
    const extracted = extractFromHtml(result.html, {
      finalUrl: "https://example.com/x",
      statusCode: 200,
    });
    expect(extracted.raw_metadata.open_graph["og:title"]).toBe('"><script>alert(1)</script>');
  });

  it("drops JSON-LD blocks that no longer parse", () => {
    const result = snapshotToFetchResult(
      { ...movieSnapshot, json_ld: ["{{{not json"] },
      "https://example.com/x",
    );
    expect(result.html).not.toContain("ld+json");
  });
});

describe("readCaptureSnapshot", () => {
  it("reads a snapshot out of items.raw_metadata", () => {
    const raw = { fetched_at: "x", capture_snapshot: movieSnapshot };
    const snap = readCaptureSnapshot(raw);
    expect(snap?.page_title).toBe("The Dark Knight (2008) - IMDb");
  });

  it("returns null when raw_metadata has no snapshot or is not an object", () => {
    expect(readCaptureSnapshot(null)).toBeNull();
    expect(readCaptureSnapshot({ open_graph: {} })).toBeNull();
    expect(readCaptureSnapshot("nope")).toBeNull();
  });
});

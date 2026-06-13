import { describe, expect, it } from "vitest";

import { parseCaptureSnapshot } from "@/lib/capture/capture-snapshot";

describe("parseCaptureSnapshot", () => {
  const validInput = {
    captured_at: "2026-06-13T00:00:00.000Z",
    page_title: "The Dark Knight (2008) - IMDb",
    canonical_url: "https://www.imdb.com/title/tt0468569/",
    meta: [
      { attr: "property", key: "og:title", content: "The Dark Knight (2008) ⭐ 9.0" },
      { attr: "name", key: "twitter:card", content: "summary_large_image" },
    ],
    json_ld: ['{"@type":"Movie","name":"The Dark Knight"}'],
    text: "When the menace known as the Joker wreaks havoc on Gotham...",
  };

  it("accepts a well-formed snapshot and preserves fields", () => {
    const parsed = parseCaptureSnapshot(validInput);
    expect(parsed).not.toBeNull();
    expect(parsed?.page_title).toBe("The Dark Knight (2008) - IMDb");
    expect(parsed?.canonical_url).toBe("https://www.imdb.com/title/tt0468569/");
    expect(parsed?.captured_at).toBe("2026-06-13T00:00:00.000Z");
    expect(parsed?.meta).toHaveLength(2);
    expect(parsed?.json_ld).toHaveLength(1);
    expect(parsed?.text).toContain("Joker");
  });

  it("returns null for non-object input", () => {
    expect(parseCaptureSnapshot(null)).toBeNull();
    expect(parseCaptureSnapshot("string")).toBeNull();
    expect(parseCaptureSnapshot([1, 2])).toBeNull();
  });

  it("returns null for an empty snapshot (no title, meta, json_ld, or text)", () => {
    expect(parseCaptureSnapshot({ meta: [], json_ld: [] })).toBeNull();
  });

  it("drops malformed meta entries and invalid JSON-LD blocks", () => {
    const parsed = parseCaptureSnapshot({
      ...validInput,
      meta: [
        { attr: "property", key: "og:title", content: "ok" },
        { attr: "style", key: "evil", content: "nope" },
        { attr: "name", key: "", content: "nope" },
        { attr: "name", key: "x", content: 42 },
      ],
      json_ld: ['{"valid":true}', "not json {{{", 42],
    });
    expect(parsed?.meta).toEqual([{ attr: "property", key: "og:title", content: "ok" }]);
    expect(parsed?.json_ld).toEqual(['{"valid":true}']);
  });

  it("truncates oversized text and rejects non-http canonical URLs", () => {
    const parsed = parseCaptureSnapshot({
      ...validInput,
      canonical_url: "javascript:alert(1)",
      text: "x".repeat(20000),
    });
    expect(parsed?.canonical_url).toBeUndefined();
    expect(parsed?.text).toHaveLength(8192);
  });

  it("returns null when total serialized size exceeds 64KB", () => {
    const parsed = parseCaptureSnapshot({
      ...validInput,
      json_ld: Array.from({ length: 10 }, () => `{"pad":"${"y".repeat(20000)}"}`),
    });
    expect(parsed).toBeNull();
  });

  it("re-stamps captured_at when missing or invalid", () => {
    const parsed = parseCaptureSnapshot({ ...validInput, captured_at: 42 });
    expect(parsed?.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

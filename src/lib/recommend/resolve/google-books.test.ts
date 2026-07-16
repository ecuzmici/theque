import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// SSRF guard is tested separately; here it always passes.
vi.mock("@/lib/enrichment/fetch", () => ({
  assertSafeFetchUrl: vi.fn().mockResolvedValue(undefined),
}));

import {
  fetchBookDescription,
  stripHtml,
  truncateAtSentence,
} from "@/lib/recommend/resolve/google-books";

function mockFetch(items: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete process.env.GOOGLE_BOOKS_API_KEY;
});

describe("stripHtml", () => {
  it("removes tags and decodes common entities", () => {
    expect(stripHtml("<p>Tom&#39;s <b>house</b> &amp; garden.<br/>Next.</p>")).toBe(
      "Tom's house & garden. Next.",
    );
  });

  it("collapses whitespace", () => {
    expect(stripHtml("A   spaced\n\nsentence.")).toBe("A spaced sentence.");
  });
});

describe("truncateAtSentence", () => {
  it("returns short text unchanged", () => {
    expect(truncateAtSentence("Short.", 100)).toBe("Short.");
  });

  it("cuts at the last full sentence inside the limit", () => {
    const text = "First sentence here. Second sentence here. Third one that runs long.";
    expect(truncateAtSentence(text, 50)).toBe("First sentence here. Second sentence here.");
  });

  it("falls back to a word boundary with ellipsis when no sentence fits", () => {
    const text = "one two three four five six seven eight nine ten";
    const out = truncateAtSentence(text, 20);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(21);
  });
});

describe("fetchBookDescription", () => {
  const VOLUME = {
    volumeInfo: {
      title: "Piranesi",
      description:
        "<p>Piranesi lives in the House. Perhaps he always has. " +
        "In his notebooks, day after day, he makes a clear and careful record of its wonders.</p>",
    },
  };

  it("returns the cleaned description for a title match", async () => {
    mockFetch([VOLUME]);
    const description = await fetchBookDescription("Piranesi", "Susanna Clarke");
    expect(description).toContain("Piranesi lives in the House.");
    expect(description).not.toContain("<p>");
  });

  it("queries intitle/inauthor and requests only the fields it needs", async () => {
    const fetchMock = mockFetch([VOLUME]);
    await fetchBookDescription("Piranesi", "Susanna Clarke");
    // URLSearchParams encodes spaces as "+", which decodeURIComponent keeps.
    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0])).replace(/\+/g, " ");
    expect(url).toContain('intitle:"Piranesi"');
    expect(url).toContain('inauthor:"Susanna Clarke"');
    expect(url).toContain("fields=items(volumeInfo(title,description))");
  });

  it("appends the API key when GOOGLE_BOOKS_API_KEY is set", async () => {
    process.env.GOOGLE_BOOKS_API_KEY = "gb-test";
    const fetchMock = mockFetch([VOLUME]);
    await fetchBookDescription("Piranesi", null);
    expect(String(fetchMock.mock.calls[0][0])).toContain("key=gb-test");
  });

  it("rejects a volume whose title doesn't match (different-book guard)", async () => {
    mockFetch([
      {
        volumeInfo: {
          title: "A Study Guide for Susanna Clarke",
          description:
            "A long enough description of a completely different companion volume to skip over.",
        },
      },
    ]);
    expect(await fetchBookDescription("Piranesi", "Susanna Clarke")).toBeNull();
  });

  it("accepts a subtitled edition of the same title", async () => {
    mockFetch([
      {
        volumeInfo: {
          title: "Piranesi: A Novel",
          description:
            "Piranesi lives in the House, and this edition description is long enough to accept.",
        },
      },
    ]);
    expect(await fetchBookDescription("Piranesi", null)).toContain("Piranesi lives in the House");
  });

  it("skips too-short descriptions", async () => {
    mockFetch([{ volumeInfo: { title: "Piranesi", description: "A novel." } }]);
    expect(await fetchBookDescription("Piranesi", null)).toBeNull();
  });

  it("fails open on fetch errors, non-ok responses, and empty results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await fetchBookDescription("Piranesi", null)).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    expect(await fetchBookDescription("Piranesi", null)).toBeNull();

    mockFetch([]);
    expect(await fetchBookDescription("Piranesi", null)).toBeNull();
  });
});

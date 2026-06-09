import { describe, expect, it, vi, afterEach } from "vitest";

// Mock server-only so it doesn't throw in test environment
vi.mock("server-only", () => ({}));

import {
  normalizeTitle,
  splitCreatorTokens,
  resolveBookWithOpenLibrary,
} from "@/lib/recommend/resolve/open-library";

// Mock the SSRF guard — assertSafeFetchUrl is tested separately in fetch.test.ts
vi.mock("@/lib/enrichment/fetch", () => ({
  assertSafeFetchUrl: vi.fn().mockResolvedValue(undefined),
}));

// ----- Unit helpers -----

describe("normalizeTitle", () => {
  it("lowercases", () => {
    expect(normalizeTitle("PIRANESI")).toBe("piranesi");
  });

  it("strips diacritics", () => {
    expect(normalizeTitle("Café")).toBe("cafe");
  });

  it("strips leading articles", () => {
    expect(normalizeTitle("The Name of the Wind")).toBe("name of the wind");
    expect(normalizeTitle("A Brief History of Time")).toBe("brief history of time");
  });
});

describe("splitCreatorTokens", () => {
  it("splits comma-separated names", () => {
    expect(splitCreatorTokens("Smith, Jones")).toEqual(["smith", "jones"]);
  });

  it("splits ampersand-separated names", () => {
    expect(splitCreatorTokens("Smith & Jones")).toEqual(["smith", "jones"]);
  });

  it("splits 'and'-separated co-authors (the prototype finding case)", () => {
    const tokens = splitCreatorTokens("Arkady and Boris Strugatsky");
    // should split into ["arkady", "boris strugatsky"] or similar
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    expect(tokens.some((t) => t.includes("arkady"))).toBe(true);
  });

  it("handles a single author", () => {
    expect(splitCreatorTokens("Susanna Clarke")).toEqual(["susanna clarke"]);
  });
});

// ----- Integration with mocked fetch -----

const BASE_DOC = {
  key: "/works/OL12345W",
  title: "Piranesi",
  author_name: ["Susanna Clarke"],
  first_publish_year: 2020,
  cover_i: 123456,
};

function mockFetch(docs: unknown[]) {
  return vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ docs }),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveBookWithOpenLibrary", () => {
  it("resolves matched fixture to canonical URL and cover", async () => {
    mockFetch([BASE_DOC]);

    const result = await resolveBookWithOpenLibrary({
      title: "Piranesi",
      creator: "Susanna Clarke",
      year: 2020,
    });

    expect(result).not.toBeNull();
    expect(result!.canonical_url).toBe("https://openlibrary.org/works/OL12345W");
    expect(result!.cover_url).toBe("https://covers.openlibrary.org/b/id/123456-L.jpg");
    expect(result!.confirmed_year).toBe(2020);
  });

  it("handles co-author strings via token split (prototype finding case)", async () => {
    mockFetch([
      {
        key: "/works/OL67890W",
        title: "Roadside Picnic",
        author_name: ["Arkady Strugatsky", "Boris Strugatsky"],
        first_publish_year: 1972,
        cover_i: 789,
      },
    ]);

    const result = await resolveBookWithOpenLibrary({
      title: "Roadside Picnic",
      creator: "Arkady and Boris Strugatsky",
      year: 1972,
    });

    expect(result).not.toBeNull();
    expect(result!.canonical_url).toContain("/works/OL67890W");
  });

  it("falls back to title-only match when author can't be confirmed", async () => {
    mockFetch([
      {
        key: "/works/OL11111W",
        title: "Piranesi",
        author_name: ["S. Clarke"], // doesn't match well
        first_publish_year: 2020,
        cover_i: 555,
      },
    ]);

    const result = await resolveBookWithOpenLibrary({
      title: "Piranesi",
      creator: "Completely Different Author Name XYZ",
      year: 2020,
    });

    // Title-only fallback should still match
    expect(result).not.toBeNull();
    expect(result!.canonical_url).toContain("/works/OL11111W");
  });

  it("returns null cover_url when cover_i is absent", async () => {
    mockFetch([
      {
        key: "/works/OL12345W",
        title: "Piranesi",
        author_name: ["Susanna Clarke"],
        first_publish_year: 2020,
        // no cover_i
      },
    ]);

    const result = await resolveBookWithOpenLibrary({
      title: "Piranesi",
      creator: "Susanna Clarke",
      year: 2020,
    });

    expect(result).not.toBeNull();
    expect(result!.cover_url).toBeNull();
  });

  it("returns null when there is no title match (genuine mismatch)", async () => {
    mockFetch([
      {
        key: "/works/OL99999W",
        title: "Something Completely Unrelated",
        author_name: ["Random Author"],
        first_publish_year: 1990,
      },
    ]);

    const result = await resolveBookWithOpenLibrary({
      title: "Piranesi",
      creator: "Susanna Clarke",
      year: 2020,
    });

    expect(result).toBeNull();
  });

  it("returns null on empty docs array", async () => {
    mockFetch([]);
    const result = await resolveBookWithOpenLibrary({
      title: "Piranesi",
      creator: "Susanna Clarke",
      year: 2020,
    });
    expect(result).toBeNull();
  });

  it("returns null when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await resolveBookWithOpenLibrary({
      title: "Piranesi",
      creator: "Susanna Clarke",
      year: 2020,
    });
    expect(result).toBeNull();
  });

  it("restricts the search to English-language works (language=eng)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [BASE_DOC] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await resolveBookWithOpenLibrary({
      title: "Piranesi",
      creator: "Susanna Clarke",
      year: 2020,
    });

    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain("language=eng");
  });

  it("returns null when API returns non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    const result = await resolveBookWithOpenLibrary({
      title: "Piranesi",
      creator: "Susanna Clarke",
      year: 2020,
    });
    expect(result).toBeNull();
  });
});

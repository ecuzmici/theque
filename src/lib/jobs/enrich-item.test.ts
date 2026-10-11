// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  fetchPage: vi.fn(),
  enrichOpenLibraryWork: vi.fn(),
  fetchViaJinaReader: vi.fn(),
  resolveCategoryEvidence: vi.fn(),
  cacheItemImage: vi.fn(),
  extractDominantColorForUrl: vi.fn(),
  forceLlmEligible: false,
  rateLimit: vi.fn(async () => ({ ok: true })),
  enhanceCategoryWithGemini: vi.fn(async () => ({ status: "skipped", reason: "test" })),
  tagItems: vi.fn(),
}));

vi.mock("@/lib/taste/tagger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taste/tagger")>();
  return { ...actual, tagItems: mocks.tagItems };
});

vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/enrichment/llm/gemini-category-enhancer", () => ({
  enhanceCategoryWithGemini: mocks.enhanceCategoryWithGemini,
}));
vi.mock("@/lib/enrichment/llm/eligibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/enrichment/llm/eligibility")>();
  return {
    ...actual,
    decideLlmEligibility: (input: Parameters<typeof actual.decideLlmEligibility>[0]) => {
      const real = actual.decideLlmEligibility(input);
      return mocks.forceLlmEligible
        ? { ...real, eligible: true, reason: "sparse", groundingRecommended: false }
        : real;
    },
  };
});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/enrichment/fetch", () => ({ fetchPage: mocks.fetchPage }));
vi.mock("@/lib/enrichment/openlibrary", () => ({
  enrichOpenLibraryWork: mocks.enrichOpenLibraryWork,
}));
vi.mock("@/lib/enrichment/jina-reader", () => ({ fetchViaJinaReader: mocks.fetchViaJinaReader }));
vi.mock("@/lib/enrichment/resolvers/index", () => ({
  resolveCategoryEvidence: mocks.resolveCategoryEvidence,
}));
vi.mock("@/lib/enrichment/image-cache", () => ({
  cacheItemImage: mocks.cacheItemImage,
  extractDominantColorForUrl: mocks.extractDominantColorForUrl,
}));

import { enrichItem } from "./enrich-item";

const HIGH_CONFIDENCE_URL = "https://www.imdb.com/title/tt0111161/";
const LOW_CONFIDENCE_URL = "https://obscure-homepage.example.com/";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    user_id: "user-1",
    canonical_url: HIGH_CONFIDENCE_URL,
    status: "inbox",
    processing_status: "pending",
    enrichment_attempts: 0,
    category: null,
    category_source: null,
    category_confidence: null,
    description: null,
    image_url: null,
    image_storage_path: null,
    dominant_color: null,
    dominant_hue: null,
    raw_metadata: {},
    structured: {},
    display: {},
    title: "Saved title",
    ...overrides,
  };
}

/** Admin client stub: `select` resolves the row; every `update` payload is recorded. */
function stubAdmin(row: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = [];
  const admin = {
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        return { eq: async () => ({ error: null }) };
      },
    })),
  };
  mocks.createAdminClient.mockReturnValue(admin);
  return updates;
}

function finalUpdate(updates: Record<string, unknown>[]) {
  return updates.find((u) => u.processing_status === "ready");
}

describe("enrichItem status rule", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.LLM_ENRICHMENT_ENABLED;
    mocks.enrichOpenLibraryWork.mockResolvedValue(null);
    mocks.fetchViaJinaReader.mockResolvedValue(null);
    mocks.resolveCategoryEvidence.mockResolvedValue(null);
    mocks.cacheItemImage.mockResolvedValue(null);
    mocks.extractDominantColorForUrl.mockResolvedValue(null);
    mocks.fetchPage.mockImplementation(async (url: string) => ({
      html: "<html><head><title>Some page title</title></head><body><p>Body text</p></body></html>",
      finalUrl: url,
      statusCode: 200,
    }));
  });

  it("moves an inbox item to want when confidence is 0.6 or more", async () => {
    const updates = stubAdmin(makeRow());
    const outcome = await enrichItem("item-1");
    expect(outcome, JSON.stringify(updates.at(-1))).toBe("ready");
    expect(finalUpdate(updates)?.status).toBe("want");
  });

  it("keeps an inbox item in inbox when confidence is below 0.6", async () => {
    const updates = stubAdmin(makeRow({ canonical_url: LOW_CONFIDENCE_URL }));
    const outcome = await enrichItem("item-1");
    expect(outcome, JSON.stringify(updates.at(-1))).toBe("ready");
    expect(finalUpdate(updates)?.status).toBe("inbox");
  });

  it.each(["done", "dismissed"])("keeps a %s item unchanged", async (status) => {
    const updates = stubAdmin(makeRow({ status }));
    const outcome = await enrichItem("item-1");
    expect(outcome, JSON.stringify(updates.at(-1))).toBe("ready");
    expect(finalUpdate(updates)?.status).toBe(status);
  });

  it("keeps a want item unchanged when confidence is low", async () => {
    const updates = stubAdmin(makeRow({ status: "want", canonical_url: LOW_CONFIDENCE_URL }));
    const outcome = await enrichItem("item-1");
    expect(outcome, JSON.stringify(updates.at(-1))).toBe("ready");
    expect(finalUpdate(updates)?.status).toBe("want");
  });

  it("keeps the status when the category is manual", async () => {
    const updates = stubAdmin(
      makeRow({
        status: "inbox",
        category: "books",
        category_source: "manual",
        category_confidence: 1,
      }),
    );
    const outcome = await enrichItem("item-1");
    expect(outcome, JSON.stringify(updates.at(-1))).toBe("ready");
    expect(finalUpdate(updates)?.status).toBe("inbox");
  });
});

describe("enrichItem cover cache", () => {
  const PAGE_IMAGE = "https://img.example/new.jpg";

  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.LLM_ENRICHMENT_ENABLED;
    mocks.enrichOpenLibraryWork.mockResolvedValue(null);
    mocks.fetchViaJinaReader.mockResolvedValue(null);
    mocks.resolveCategoryEvidence.mockResolvedValue(null);
    mocks.cacheItemImage.mockResolvedValue({
      storagePath: "user-1/item-1/cover.jpg",
      dominantColor: "#112233",
      dominantHue: 210,
    });
    mocks.extractDominantColorForUrl.mockResolvedValue({
      storagePath: null,
      dominantColor: "#445566",
      dominantHue: 200,
    });
    mocks.fetchPage.mockImplementation(async (url: string) => ({
      html: `<html><head><title>Page</title><meta property="og:image" content="${PAGE_IMAGE}"></head><body></body></html>`,
      finalUrl: url,
      statusCode: 200,
    }));
  });

  it("caches the cover again when the image URL changes", async () => {
    const updates = stubAdmin(
      makeRow({
        image_url: "https://img.example/old.jpg",
        image_storage_path: "user-1/item-1/cover.png",
        dominant_color: "#000000",
      }),
    );
    await enrichItem("item-1");
    expect(mocks.cacheItemImage).toHaveBeenCalledWith(expect.anything(), "user-1", "item-1", PAGE_IMAGE);
    expect(finalUpdate(updates)).toMatchObject({
      image_storage_path: "user-1/item-1/cover.jpg",
      dominant_color: "#112233",
    });
  });

  it("only extracts the color when the URL is the same and the color is missing", async () => {
    const updates = stubAdmin(
      makeRow({ image_url: PAGE_IMAGE, image_storage_path: "user-1/item-1/cover.jpg" }),
    );
    await enrichItem("item-1");
    expect(mocks.cacheItemImage).not.toHaveBeenCalled();
    expect(mocks.extractDominantColorForUrl).toHaveBeenCalledWith(PAGE_IMAGE);
    expect(finalUpdate(updates)?.dominant_color).toBe("#445566");
  });
});

describe("enrichItem LLM daily cap", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.forceLlmEligible = true;
    mocks.enrichOpenLibraryWork.mockResolvedValue(null);
    mocks.fetchViaJinaReader.mockResolvedValue(null);
    mocks.resolveCategoryEvidence.mockResolvedValue(null);
    mocks.cacheItemImage.mockResolvedValue(null);
    mocks.extractDominantColorForUrl.mockResolvedValue(null);
    mocks.enhanceCategoryWithGemini.mockResolvedValue({ status: "skipped", reason: "test" });
    mocks.fetchPage.mockImplementation(async (url: string) => ({
      html: "<html><head><title>Some page title</title></head><body></body></html>",
      finalUrl: url,
      statusCode: 200,
    }));
  });

  afterEach(() => {
    mocks.forceLlmEligible = false;
  });

  it("calls the LLM while the user is under the daily cap", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: true });
    stubAdmin(makeRow());
    await enrichItem("item-1");
    expect(mocks.rateLimit).toHaveBeenCalledWith("llm-enrich:user-1", 100, 86400);
    expect(mocks.enhanceCategoryWithGemini).toHaveBeenCalled();
  });

  it("skips the LLM and records the reason when the cap is reached", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false });
    const updates = stubAdmin(makeRow());
    const outcome = await enrichItem("item-1");
    expect(outcome).toBe("ready");
    expect(mocks.enhanceCategoryWithGemini).not.toHaveBeenCalled();
    expect(finalUpdate(updates)?.raw_metadata).toMatchObject({ llm_skipped: "daily_cap" });
  });
});


describe("enrichItem resolvers and byline", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.LLM_ENRICHMENT_ENABLED;
    mocks.enrichOpenLibraryWork.mockResolvedValue(null);
    mocks.fetchViaJinaReader.mockResolvedValue(null);
    mocks.resolveCategoryEvidence.mockResolvedValue(null);
    mocks.cacheItemImage.mockResolvedValue(null);
    mocks.extractDominantColorForUrl.mockResolvedValue(null);
  });

  it("takes the cover and title from TMDB when the page is blocked", async () => {
    const url = "https://www.themoviedb.org/movie/886083-deadstream";
    mocks.fetchPage.mockResolvedValue({ html: "<html><head></head><body></body></html>", finalUrl: url, statusCode: 403 });
    mocks.resolveCategoryEvidence.mockResolvedValue({
      source: "tmdb",
      title: "Deadstream",
      image_url: "https://image.tmdb.org/t/p/w500/deadstream.jpg",
      structured: { year: 2022, directors: ["Joseph Winter", "Vanessa Winter"] },
    });
    const updates = stubAdmin(makeRow({ canonical_url: url, title: null }));

    await enrichItem("item-1");

    expect(mocks.resolveCategoryEvidence).toHaveBeenCalledWith(
      "movies_and_tv",
      expect.objectContaining({ canonicalUrl: url }),
    );
    expect(finalUpdate(updates)).toMatchObject({
      title: "Deadstream",
      image_url: "https://image.tmdb.org/t/p/w500/deadstream.jpg",
      subtitle: "Joseph Winter · 2022",
    });
  });

  it("replaces a hardcover.app share card with the resolver cover", async () => {
    const url = "https://hardcover.app/books/the-three-body-problem";
    mocks.fetchPage.mockResolvedValue({
      html: `<html><head><title>The Three-Body Problem by Liu Cixin | Hardcover</title>
        <meta property="og:title" content="The Three-Body Problem" />
        <meta property="og:image" content="https://hardcover.app/books/the-three-body-problem/ogimage.png" />
        </head><body></body></html>`,
      finalUrl: url,
      statusCode: 200,
    });
    mocks.resolveCategoryEvidence.mockResolvedValue({
      source: "hardcover",
      image_url: "https://assets.hardcover.app/edition/1/cover.jpg",
      structured: { authors: ["Liu Cixin"] },
    });
    const updates = stubAdmin(
      makeRow({
        canonical_url: url,
        image_url: "https://hardcover.app/books/the-three-body-problem/ogimage.png",
      }),
    );

    await enrichItem("item-1");

    expect(finalUpdate(updates)?.image_url).toBe("https://assets.hardcover.app/edition/1/cover.jpg");
  });

  it("runs the resolvers when the fields are full but the cover is missing", async () => {
    const url = "https://www.imdb.com/title/tt0111161/";
    mocks.fetchPage.mockResolvedValue({
      html: `<html><head><script type="application/ld+json">${JSON.stringify({
        "@type": "Movie",
        name: "The Shawshank Redemption",
        datePublished: "1994-09-23",
        director: [{ "@type": "Person", name: "Frank Darabont" }],
      })}</script></head><body></body></html>`,
      finalUrl: url,
      statusCode: 200,
    });
    stubAdmin(makeRow({ canonical_url: url }));

    await enrichItem("item-1");

    expect(mocks.resolveCategoryEvidence).toHaveBeenCalled();
  });
});

describe("enrichItem taste tags", () => {
  const BOOK_URL = "https://hardcover.app/books/piranesi";

  function stubBookPage() {
    mocks.fetchPage.mockResolvedValue({
      html: `<html><head><title>Piranesi</title>
        <meta property="og:description" content="A man lives in a house of endless halls." />
        </head><body></body></html>`,
      finalUrl: BOOK_URL,
      statusCode: 200,
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.LLM_ENRICHMENT_ENABLED = "true";
    process.env.AI_GATEWAY_API_KEY = "test-key";
    mocks.enrichOpenLibraryWork.mockResolvedValue(null);
    mocks.fetchViaJinaReader.mockResolvedValue(null);
    mocks.cacheItemImage.mockResolvedValue(null);
    mocks.extractDominantColorForUrl.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue({ ok: true });
    stubBookPage();
  });

  afterEach(() => {
    delete process.env.LLM_ENRICHMENT_ENABLED;
    delete process.env.AI_GATEWAY_API_KEY;
  });

  function tagUpdate(updates: Record<string, unknown>[]) {
    return updates.find((u) => "taste_tagged_at" in u);
  }

  it("writes genre keys from structured.genres with the final update", async () => {
    mocks.resolveCategoryEvidence.mockResolvedValue({
      source: "hardcover",
      structured: { authors: ["Susanna Clarke"], genres: ["Fantasy", "Fiction"] },
    });
    mocks.tagItems.mockResolvedValue([]);
    const updates = stubAdmin(makeRow({ canonical_url: BOOK_URL }));
    await enrichItem("item-1");
    expect(finalUpdate(updates)?.genre_keys).toEqual(["fantasy"]);
  });

  it("keeps the old genre keys when the genres map to no key", async () => {
    mocks.resolveCategoryEvidence.mockResolvedValue(null);
    mocks.tagItems.mockResolvedValue([]);
    const updates = stubAdmin(makeRow({ canonical_url: BOOK_URL, genre_keys: ["horror"] }));
    await enrichItem("item-1");
    expect(finalUpdate(updates)).not.toHaveProperty("genre_keys");
  });

  it("tags moods and LLM genres for a book with no deterministic key", async () => {
    mocks.resolveCategoryEvidence.mockResolvedValue(null);
    mocks.tagItems.mockResolvedValue([
      { id: "item-1", mood_keys: ["eerie", "slow-burn"], genre_keys: ["fantasy"] },
    ]);
    const updates = stubAdmin(makeRow({ canonical_url: BOOK_URL }));
    await enrichItem("item-1");
    expect(mocks.rateLimit).toHaveBeenCalledWith("llm-enrich:user-1", 100, 86400);
    expect(tagUpdate(updates)).toMatchObject({
      mood_keys: ["eerie", "slow-burn"],
      genre_keys: ["fantasy"],
      taste_tagged_at: expect.any(String),
    });
  });

  it("does not write LLM genres when a deterministic key exists", async () => {
    mocks.resolveCategoryEvidence.mockResolvedValue({
      source: "hardcover",
      structured: { genres: ["Horror"] },
    });
    mocks.tagItems.mockResolvedValue([{ id: "item-1", mood_keys: ["dark"], genre_keys: ["fantasy"] }]);
    const updates = stubAdmin(makeRow({ canonical_url: BOOK_URL }));
    await enrichItem("item-1");
    expect(finalUpdate(updates)?.genre_keys).toEqual(["horror"]);
    expect(tagUpdate(updates)).toMatchObject({ mood_keys: ["dark"] });
    expect(tagUpdate(updates)).not.toHaveProperty("genre_keys");
  });

  it("leaves taste_tagged_at null past the daily cap", async () => {
    mocks.resolveCategoryEvidence.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue({ ok: false });
    const updates = stubAdmin(makeRow({ canonical_url: BOOK_URL }));
    const outcome = await enrichItem("item-1");
    expect(outcome).toBe("ready");
    expect(mocks.tagItems).not.toHaveBeenCalled();
    expect(tagUpdate(updates)).toBeUndefined();
  });

  it("does not fail the enrichment when the tagger throws", async () => {
    mocks.resolveCategoryEvidence.mockResolvedValue(null);
    mocks.tagItems.mockRejectedValue(new Error("gateway down"));
    const updates = stubAdmin(makeRow({ canonical_url: BOOK_URL }));
    const outcome = await enrichItem("item-1");
    expect(outcome).toBe("ready");
    expect(tagUpdate(updates)).toBeUndefined();
  });

  it("skips tagging when LLM enrichment is off or the item is tagged already", async () => {
    mocks.resolveCategoryEvidence.mockResolvedValue(null);
    stubAdmin(makeRow({ canonical_url: BOOK_URL, taste_tagged_at: "2026-10-01T00:00:00Z" }));
    await enrichItem("item-1");
    expect(mocks.tagItems).not.toHaveBeenCalled();

    delete process.env.LLM_ENRICHMENT_ENABLED;
    stubAdmin(makeRow({ canonical_url: BOOK_URL }));
    await enrichItem("item-1");
    expect(mocks.tagItems).not.toHaveBeenCalled();
  });
});

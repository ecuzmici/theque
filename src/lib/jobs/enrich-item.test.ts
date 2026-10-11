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
}));

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


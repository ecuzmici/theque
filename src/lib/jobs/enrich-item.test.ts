// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  fetchPage: vi.fn(),
  enrichOpenLibraryWork: vi.fn(),
  fetchViaJinaReader: vi.fn(),
  resolveCategoryEvidence: vi.fn(),
  cacheItemImage: vi.fn(),
  extractDominantColorForUrl: vi.fn(),
}));

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

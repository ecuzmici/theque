import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const TEST_FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const mocks = vi.hoisted(() => ({
  getSessionUserOrNull: vi.fn(),
  from: vi.fn(),
  mergedImageUrl: null as string | null,
  afterCallbacks: [] as Array<() => Promise<void>>,
  cacheItemImage: vi.fn(),
  adminUpdate: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: (cb: () => Promise<void>) => {
    mocks.afterCallbacks.push(cb);
  },
}));
vi.mock("@/lib/enrichment/image-cache", () => ({ cacheItemImage: mocks.cacheItemImage }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (payload: unknown) => {
        mocks.adminUpdate(payload);
        return { eq: () => ({ eq: async () => ({ error: null }) }) };
      },
    }),
  }),
}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserOrNull: mocks.getSessionUserOrNull,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/enrichment/llm/category-schemas", () => ({
  validateLlmItemRewriteProposal: (value: unknown) => ({ ok: true, value }),
}));
vi.mock("@/lib/enrichment/llm/apply-item-rewrite-proposal", () => ({
  applyItemRewriteProposal: () => ({
    title: "New title",
    subtitle: null,
    description: null,
    image_url: mocks.mergedImageUrl,
    category: "books",
    category_confidence: 1,
    category_source: "llm",
    structured: {},
    rawMetadata: {},
  }),
}));

describe("POST /api/items/[id]/ai-enrichment-apply (ADR 0013 field decryption)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.FIELD_ENCRYPTION_KEY = TEST_FIELD_ENCRYPTION_KEY;
    mocks.getSessionUserOrNull.mockReset();
    mocks.from.mockReset();
    mocks.mergedImageUrl = null;
    mocks.afterCallbacks.length = 0;
    mocks.cacheItemImage.mockReset();
    mocks.adminUpdate.mockReset();
  });

  it("returns a decrypted note and verdict", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue({ id: "user-1" });
    const { encryptField } = await import("@/lib/crypto/field-crypto");
    const row = {
      id: "item-1",
      user_id: "user-1",
      category: "books",
      category_confidence: 0.9,
      category_source: "domain",
      structured: {},
      raw_metadata: {},
      note: encryptField("private note"),
      verdict: encryptField("great pick"),
    };
    mocks.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    }));

    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://theque.app/api/items/item-1/ai-enrichment-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: {} }),
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note).toBe("private note");
    expect(body.verdict).toBe("great pick");
  });

  async function applyWith(row: Record<string, unknown>) {
    mocks.getSessionUserOrNull.mockResolvedValue({ id: "user-1" });
    mocks.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    }));
    const { POST } = await import("./route");
    return POST(
      new Request("https://theque.app/api/items/item-1/ai-enrichment-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: {} }),
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    );
  }

  const baseRow = {
    id: "item-1",
    user_id: "user-1",
    image_url: "https://img.example/old.jpg",
    structured: {},
    raw_metadata: {},
    note: null,
    verdict: null,
  };

  it("caches the new cover after the response when the image URL changes", async () => {
    mocks.mergedImageUrl = "https://img.example/new.jpg";
    mocks.cacheItemImage.mockResolvedValue({
      storagePath: "user-1/item-1/cover.jpg",
      dominantColor: "#112233",
      dominantHue: 210,
    });

    const res = await applyWith(baseRow);
    expect(res.status).toBe(200);
    expect(mocks.afterCallbacks).toHaveLength(1);
    await mocks.afterCallbacks[0]();

    expect(mocks.cacheItemImage).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "item-1",
      "https://img.example/new.jpg",
    );
    expect(mocks.adminUpdate).toHaveBeenCalledWith({
      image_storage_path: "user-1/item-1/cover.jpg",
      dominant_color: "#112233",
      dominant_hue: 210,
    });
  });

  it("does not cache when the image URL stays the same", async () => {
    mocks.mergedImageUrl = "https://img.example/old.jpg";
    await applyWith(baseRow);
    expect(mocks.afterCallbacks).toHaveLength(0);
  });
});

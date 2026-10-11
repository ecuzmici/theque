import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const TEST_FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const mocks = vi.hoisted(() => ({
  getSessionUserOrNull: vi.fn(),
  from: vi.fn(),
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
    image_url: null,
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
});

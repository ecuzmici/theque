/**
 * Tests for POST /api/recommend
 *
 * Mocks: getSessionUserOrNull, rateLimit, Supabase client, AI Gateway helper, resolver
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserOrNull: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ ok: true }),
}));

const mocks = vi.hoisted(() => ({
  itemsSelect: vi.fn(),
  outcomesSelect: vi.fn(),
  outcomesInsert: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: mocks.from,
  }),
}));

vi.mock("@/lib/recommend/resolve/open-library", () => ({
  resolveBookWithOpenLibrary: vi.fn(),
}));

vi.mock("@/lib/recommend/resolve/tmdb", () => ({
  resolveMovieWithTmdb: vi.fn(),
}));

vi.mock("@/lib/ai/gateway", () => ({
  generateJsonWithFallback: vi.fn(),
}));

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { rateLimit } from "@/lib/rate-limit";
import { resolveBookWithOpenLibrary } from "@/lib/recommend/resolve/open-library";
import { generateJsonWithFallback } from "@/lib/ai/gateway";
import { POST } from "@/app/api/recommend/route";

const SAMPLE_USER = { id: "user-123", email: "test@example.com" };

const LIBRARY_ITEMS = Array.from({ length: 5 }, (_, i) => ({
  title: `Book ${i}`,
  status: "want" as const,
  rating_personal: null,
  verdict: null,
  structured: { authors: [`Author ${i}`], published_year: 2000 + i },
  category: "books" as const,
}));

const LOVED_ITEM = {
  title: "Life As We Knew It",
  status: "done" as const,
  rating_personal: 5,
  verdict: "very good, optimistic ending",
  structured: { authors: ["Susan Beth Pfeffer"], published_year: 2006 },
  category: "books" as const,
};

const DISLIKED_ITEM = {
  title: "Wanderers",
  status: "done" as const,
  rating_personal: 2,
  verdict: "too slow",
  structured: { authors: ["Chuck Wendig"], published_year: 2019 },
  category: "books" as const,
};

function mockSupabase(options: {
  libraryItems?: typeof LIBRARY_ITEMS;
  outcomes?: Array<{ title_norm: string; outcome: string; shown_at: string }>;
  insertId?: string;
}) {
  const {
    libraryItems = LIBRARY_ITEMS,
    outcomes = [],
    insertId = "outcome-uuid-1",
  } = options;

  mocks.itemsSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: libraryItems, error: null }),
    }),
  });

  mocks.outcomesSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: outcomes, error: null }),
    }),
  });

  mocks.outcomesInsert.mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: insertId }, error: null }),
    }),
  });

  mocks.from.mockImplementation((table: string) => {
    if (table === "items") {
      return { select: mocks.itemsSelect };
    }
    if (table === "recommendation_outcomes") {
      return {
        select: mocks.outcomesSelect,
        insert: mocks.outcomesInsert,
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

function mockGatewaySuccess(candidates: unknown[]) {
  vi.mocked(generateJsonWithFallback).mockResolvedValue({
    data: { candidates },
    model: "google/gemini-3.1-flash-lite",
  });
}

function mockResolverSuccess() {
  vi.mocked(resolveBookWithOpenLibrary).mockResolvedValue({
    canonical_url: "https://openlibrary.org/works/OL12345W",
    cover_url: "https://covers.openlibrary.org/b/id/123456-L.jpg",
    confirmed_year: 2020,
    external_id: "OL12345W",
    verified_author: null,
  });
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  vi.mocked(rateLimit).mockResolvedValue({ ok: true });
  vi.mocked(getSessionUserOrNull).mockResolvedValue(null);
});

describe("POST /api/recommend", () => {
  describe("auth", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(null);
      const res = await POST(makeRequest({ shelfId: "books" }));
      expect(res.status).toBe(401);
    });
  });

  describe("input validation", () => {
    beforeEach(() => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({});
    });

    it("returns 400 for invalid shelfId", async () => {
      const res = await POST(makeRequest({ shelfId: "invalid-shelf" }));
      expect(res.status).toBe(400);
    });

    it("accepts shelfId-only input", async () => {
      mockGatewaySuccess([]);
      mockResolverSuccess();
      const res = await POST(makeRequest({ shelfId: "books" }));
      expect(res.status).toBe(200);
    });

    it("returns 400 when items field is present", async () => {
      const res = await POST(
        makeRequest({
          shelfId: "books",
          items: [{ title: "A", creator: "B", year: 2020 }],
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("items must not be sent");
    });

    it("returns 400 when library has fewer than min items", async () => {
      mockSupabase({
        libraryItems: [LIBRARY_ITEMS[0]] as typeof LIBRARY_ITEMS,
      });
      const res = await POST(makeRequest({ shelfId: "books" }));
      expect(res.status).toBe(400);
    });
  });

  describe("gate check", () => {
    it("returns 503 when the AI Gateway is not configured", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      delete process.env.AI_GATEWAY_API_KEY;
      const res = await POST(makeRequest({ shelfId: "books" }));
      expect(res.status).toBe(503);
    });
  });

  describe("rate limiting", () => {
    it("returns 429 when rate limit exceeded", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({});
      vi.mocked(rateLimit).mockResolvedValue({ ok: false, retryAfter: 3600 });
      const res = await POST(makeRequest({ shelfId: "books" }));
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("3600");
    });
  });

  describe("LLM failure", () => {
    it("returns 502 when every gateway model fails", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({});
      vi.mocked(generateJsonWithFallback).mockRejectedValue(new Error("all_models_failed"));
      const res = await POST(makeRequest({ shelfId: "books" }));
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toBe("Could not generate recommendations");
    });

    it("returns 502 when the gateway returns an invalid shape", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({});
      vi.mocked(generateJsonWithFallback).mockResolvedValue({
        data: { wrong: "shape" },
        model: "google/gemini-3.1-flash-lite",
      } as never);
      const res = await POST(makeRequest({ shelfId: "books" }));
      expect(res.status).toBe(502);
    });
  });

  describe("taste profile prompt", () => {
    it("passes LOVED/DISLIKED/NEVER content to the gateway", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({
        libraryItems: [...LIBRARY_ITEMS, LOVED_ITEM, DISLIKED_ITEM] as typeof LIBRARY_ITEMS,
        outcomes: [
          {
            title_norm: "dismissed pick",
            outcome: "dismissed",
            shown_at: new Date().toISOString(),
          },
        ],
      });
      mockGatewaySuccess([]);
      mockResolverSuccess();

      await POST(makeRequest({ shelfId: "books" }));

      const call = vi.mocked(generateJsonWithFallback).mock.calls[0][0];
      expect(call.prompt).toContain("LOVED (rated 4–5★):");
      expect(call.prompt).toContain("Life As We Knew It");
      expect(call.prompt).toContain("very good, optimistic ending");
      expect(call.prompt).toContain("DISLIKED (rated 1–2★)");
      expect(call.prompt).toContain("Wanderers");
      expect(call.prompt).toContain("NEVER suggest these titles:");
      expect(call.prompt).toContain("dismissed pick");
    });

    it("does not include shown outcomes older than 30 days in NEVER", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);
      mockSupabase({
        outcomes: [
          {
            title_norm: "old shown pick",
            outcome: "shown",
            shown_at: oldDate.toISOString(),
          },
        ],
      });
      mockGatewaySuccess([]);
      mockResolverSuccess();

      await POST(makeRequest({ shelfId: "books" }));

      const call = vi.mocked(generateJsonWithFallback).mock.calls[0][0];
      expect(call.prompt).not.toContain("old shown pick");
    });
  });

  describe("success path", () => {
    it("returns 200 with resolved cards including outcome_id", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({ insertId: "outcome-abc" });
      mockGatewaySuccess([
        { title: "Piranesi", creator: "Susanna Clarke", year: 2020, description: "A book", reason: "Great" },
      ]);
      mockResolverSuccess();

      const res = await POST(makeRequest({ shelfId: "books" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cards[0].outcome_id).toBe("outcome-abc");
    });

    it("writes shown rows on success", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({});
      mockGatewaySuccess([
        { title: "Piranesi", creator: "Susanna Clarke", year: 2020, description: "A book", reason: "Great" },
      ]);
      mockResolverSuccess();

      await POST(makeRequest({ shelfId: "books" }));

      expect(mocks.outcomesInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: SAMPLE_USER.id,
          category: "books",
          external_id: "OL12345W",
          outcome: "shown",
        }),
      );
    });

    it("NEVER list suppresses dismissed titles from the response", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({
        outcomes: [
          {
            title_norm: "piranesi",
            outcome: "dismissed",
            shown_at: new Date().toISOString(),
          },
        ],
      });
      mockGatewaySuccess([
        { title: "Piranesi", creator: "Susanna Clarke", year: 2020, description: "A book", reason: "Great" },
        { title: "Klara and the Sun", creator: "Kazuo Ishiguro", year: 2021, description: "A book 2", reason: "Also great" },
      ]);
      mockResolverSuccess();

      const res = await POST(makeRequest({ shelfId: "books" }));
      const body = await res.json();
      expect(body.cards.map((c: { title: string }) => c.title)).not.toContain("Piranesi");
    });

    it("prefers the resolver's verified author over the LLM creator in the subtitle", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({});
      mockGatewaySuccess([
        { title: "The Gone World", creator: "Tom DeLonge", year: 2018, description: "Desc", reason: "Reason" },
      ]);
      vi.mocked(resolveBookWithOpenLibrary).mockResolvedValue({
        canonical_url: "https://openlibrary.org/works/OLgoneW",
        cover_url: null,
        confirmed_year: 2018,
        external_id: "OLgoneW",
        verified_author: "Tom Sweterlitsch",
      });

      const res = await POST(makeRequest({ shelfId: "books" }));
      const body = await res.json();
      expect(body.cards[0].subtitle).toContain("Tom Sweterlitsch");
      expect(body.cards[0].subtitle).not.toContain("Tom DeLonge");
    });

    it("deduplicates against existing library titles", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({
        libraryItems: [
          ...LIBRARY_ITEMS,
          {
            title: "Piranesi",
            status: "want" as const,
            rating_personal: null,
            verdict: null,
            structured: { authors: ["Susanna Clarke"], published_year: 2020 },
            category: "books" as const,
          },
        ] as typeof LIBRARY_ITEMS,
      });
      mockGatewaySuccess([
        { title: "Piranesi", creator: "Susanna Clarke", year: 2020, description: "A book", reason: "Great" },
        { title: "Klara and the Sun", creator: "Kazuo Ishiguro", year: 2021, description: "A book 2", reason: "Also great" },
      ]);
      mockResolverSuccess();

      const res = await POST(makeRequest({ shelfId: "books" }));
      const body = await res.json();
      expect(body.cards.map((c: { title: string }) => c.title)).not.toContain("Piranesi");
    });

    it("drops unresolved candidates gracefully (returns what survived)", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({});
      mockGatewaySuccess([
        { title: "A Real Book", creator: "Real Author", year: 2020, description: "Desc", reason: "Reason" },
      ]);
      vi.mocked(resolveBookWithOpenLibrary).mockResolvedValue(null);

      const res = await POST(makeRequest({ shelfId: "books" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cards).toHaveLength(0);
    });
  });
});

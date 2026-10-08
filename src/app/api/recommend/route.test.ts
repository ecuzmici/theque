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

// Hardcover finds nothing by default, so book tests exercise the Open Library fallback.
vi.mock("@/lib/recommend/resolve/hardcover", () => ({
  resolveBooksWithHardcover: vi.fn(async (candidates: unknown[]) => candidates.map(() => null)),
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
import { resolveBooksWithHardcover } from "@/lib/recommend/resolve/hardcover";
import { generateJsonWithFallback } from "@/lib/ai/gateway";
import { RECOMMEND_RESPONSE_SCHEMA } from "@/lib/recommend/recommend-prompt";
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

  // Batch insert: insert(rows[]).select("id, title_norm") — return matching rows
  mocks.outcomesInsert.mockImplementation(
    (rows: Array<{ title_norm: string; [k: string]: unknown }>) => {
      const data = (Array.isArray(rows) ? rows : [rows]).map((r, i) => ({
        id: i === 0 ? insertId : `${insertId}-${i}`,
        title_norm: r.title_norm,
      }));
      return {
        select: vi.fn().mockResolvedValue({ data, error: null }),
      };
    },
  );

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
      expect(call.schema).toBe(RECOMMEND_RESPONSE_SCHEMA);
    });

    it("excludes shown outcomes past the cooldown but keeps recent ones (ADR 0016: 14d)", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      const staleShown = new Date();
      staleShown.setDate(staleShown.getDate() - 20); // past the 14-day window
      const recentShown = new Date();
      recentShown.setDate(recentShown.getDate() - 5); // within the window
      mockSupabase({
        outcomes: [
          { title_norm: "stale shown pick", outcome: "shown", shown_at: staleShown.toISOString() },
          { title_norm: "recent shown pick", outcome: "shown", shown_at: recentShown.toISOString() },
        ],
      });
      mockGatewaySuccess([]);
      mockResolverSuccess();

      await POST(makeRequest({ shelfId: "books" }));

      const call = vi.mocked(generateJsonWithFallback).mock.calls[0][0];
      expect(call.prompt).not.toContain("stale shown pick");
      expect(call.prompt).toContain("recent shown pick");
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
      expect(body.cards[0].source).toBe("open_library");
    });

    it("uses the Hardcover match before Open Library", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({ insertId: "outcome-hc" });
      mockGatewaySuccess([
        { title: "Piranesi", creator: "Susanna Clarke", year: 2020, description: "A book", reason: "Great" },
      ]);
      mockResolverSuccess();
      vi.mocked(resolveBooksWithHardcover).mockResolvedValueOnce([
        {
          canonical_url: "https://hardcover.app/books/piranesi",
          cover_url: "https://assets.hardcover.app/piranesi.jpg",
          confirmed_year: null,
          external_id: "hardcover:123",
          verified_author: "Susanna Clarke",
        },
      ]);

      const res = await POST(makeRequest({ shelfId: "books" }));
      const body = await res.json();
      expect(body.cards[0].source).toBe("hardcover");
      expect(body.cards[0].canonical_url).toBe("https://hardcover.app/books/piranesi");
      expect(resolveBookWithOpenLibrary).not.toHaveBeenCalled();
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
        expect.arrayContaining([
          expect.objectContaining({
            user_id: SAMPLE_USER.id,
            category: "books",
            external_id: "OL12345W",
            outcome: "shown",
          }),
        ]),
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

    it("reports reason=transient when nothing resolves (ADR 0016)", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({});
      mockGatewaySuccess([
        { title: "A Real Book", creator: "Real Author", year: 2020, description: "Desc", reason: "Reason" },
      ]);
      vi.mocked(resolveBookWithOpenLibrary).mockResolvedValue(null);

      const res = await POST(makeRequest({ shelfId: "books" }));
      const body = await res.json();
      expect(body.cards).toHaveLength(0);
      expect(body.reason).toBe("transient");
    });

    it("reports reason=exhausted when a full batch resolves but all are owned (ADR 0016)", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      // Library is Book 0..Book 4; the LLM proposes those same five titles, so
      // every resolved candidate is deduped away — the taste-graph-edge case.
      mockSupabase({});
      mockGatewaySuccess(
        Array.from({ length: 5 }, (_, i) => ({
          title: `Book ${i}`,
          creator: `Author ${i}`,
          year: 2000 + i,
          description: "Desc",
          reason: "Reason",
        })),
      );
      mockResolverSuccess();

      const res = await POST(makeRequest({ shelfId: "books" }));
      const body = await res.json();
      expect(body.cards).toHaveLength(0);
      expect(body.reason).toBe("exhausted");
    });

    it("echoes owned library titles into the prompt (ADR 0016)", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabase({});
      mockGatewaySuccess([]);
      mockResolverSuccess();

      await POST(makeRequest({ shelfId: "books" }));

      const call = vi.mocked(generateJsonWithFallback).mock.calls[0][0];
      expect(call.prompt).toContain("ALREADY IN THEIR LIBRARY");
      expect(call.prompt).toContain('- "Book 0"');
    });
  });
});

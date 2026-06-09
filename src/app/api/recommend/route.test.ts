/**
 * Tests for POST /api/recommend
 *
 * Mocks: getSessionUserOrNull, rateLimit, Supabase client, AI Gateway helper, resolver
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock server-only so it doesn't throw in test environment
vi.mock("server-only", () => ({}));

// --- Mock session auth ---
vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserOrNull: vi.fn(),
}));

// --- Mock rate limit ---
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ ok: true }),
}));

// --- Mock Supabase client (server) ---
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: mocks.from,
  }),
}));

// --- Mock resolver ---
vi.mock("@/lib/recommend/resolve/open-library", () => ({
  resolveBookWithOpenLibrary: vi.fn(),
}));

vi.mock("@/lib/recommend/resolve/tmdb", () => ({
  resolveMovieWithTmdb: vi.fn(),
}));

// --- Mock AI Gateway LLM call (server-only module; mock to avoid importing it) ---
// isGatewayConfigured / parseModelList live in the pure ./gateway-config module
// (no server-only) and are used as-is — isGatewayConfigured reads AI_GATEWAY_API_KEY.
vi.mock("@/lib/ai/gateway", () => ({
  generateJsonWithFallback: vi.fn(),
}));

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { rateLimit } from "@/lib/rate-limit";
import { resolveBookWithOpenLibrary } from "@/lib/recommend/resolve/open-library";
import { generateJsonWithFallback } from "@/lib/ai/gateway";
import { POST } from "@/app/api/recommend/route";

const SAMPLE_USER = { id: "user-123", email: "test@example.com" };
const SAMPLE_BOOKS = Array.from({ length: 5 }, (_, i) => ({
  title: `Book ${i}`,
  creator: `Author ${i}`,
  year: 2000 + i,
}));

function mockSupabaseQuery(titles: string[]) {
  mocks.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: titles.map((t) => ({ title: t })),
          error: null,
        }),
      }),
    }),
  });
}

function mockGatewaySuccess(candidates: unknown[]) {
  vi.mocked(generateJsonWithFallback).mockResolvedValue({
    data: { candidates },
    model: "openai/gpt-5-mini",
  });
}

function mockResolverSuccess() {
  vi.mocked(resolveBookWithOpenLibrary).mockResolvedValue({
    canonical_url: "https://openlibrary.org/works/OL12345W",
    cover_url: "https://covers.openlibrary.org/b/id/123456-L.jpg",
    confirmed_year: 2020,
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
  // Re-establish default mocks that vi.clearAllMocks() wiped
  vi.mocked(rateLimit).mockResolvedValue({ ok: true });
  vi.mocked(getSessionUserOrNull).mockResolvedValue(null);
});

describe("POST /api/recommend", () => {
  describe("auth", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(null);
      const res = await POST(makeRequest({ shelfId: "books", items: SAMPLE_BOOKS }));
      expect(res.status).toBe(401);
    });
  });

  describe("input validation", () => {
    beforeEach(() => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabaseQuery([]);
    });

    it("returns 400 for invalid shelfId", async () => {
      const res = await POST(
        makeRequest({ shelfId: "invalid-shelf", items: SAMPLE_BOOKS }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty items array", async () => {
      const res = await POST(makeRequest({ shelfId: "books", items: [] }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when items has fewer than min items", async () => {
      const res = await POST(
        makeRequest({ shelfId: "books", items: [{ title: "A", creator: "B", year: 2020 }] }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when items exceeds max", async () => {
      const manyItems = Array.from({ length: 25 }, (_, i) => ({
        title: `Book ${i}`,
        creator: `Author ${i}`,
        year: 2000 + i,
      }));
      const res = await POST(makeRequest({ shelfId: "books", items: manyItems }));
      expect(res.status).toBe(400);
    });
  });

  describe("gate check", () => {
    it("returns 503 when the AI Gateway is not configured", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      delete process.env.AI_GATEWAY_API_KEY;
      const res = await POST(makeRequest({ shelfId: "books", items: SAMPLE_BOOKS }));
      expect(res.status).toBe(503);
    });
  });

  describe("rate limiting", () => {
    it("returns 429 when rate limit exceeded", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      vi.mocked(rateLimit).mockResolvedValue({ ok: false, retryAfter: 3600 });
      const res = await POST(makeRequest({ shelfId: "books", items: SAMPLE_BOOKS }));
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("3600");
    });
  });

  describe("LLM failure", () => {
    it("returns 502 when every gateway model fails", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabaseQuery([]);
      vi.mocked(generateJsonWithFallback).mockRejectedValue(new Error("all_models_failed"));
      const res = await POST(makeRequest({ shelfId: "books", items: SAMPLE_BOOKS }));
      expect(res.status).toBe(502);
      const body = await res.json();
      // Should NOT expose the raw error message
      expect(body.error).toBe("Could not generate recommendations");
    });

    it("returns 502 when the gateway returns an invalid shape", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabaseQuery([]);
      vi.mocked(generateJsonWithFallback).mockResolvedValue({
        data: { wrong: "shape" },
        model: "openai/gpt-5-mini",
      } as never);
      const res = await POST(makeRequest({ shelfId: "books", items: SAMPLE_BOOKS }));
      expect(res.status).toBe(502);
    });
  });

  describe("success path", () => {
    it("returns 200 with resolved cards", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabaseQuery([]);
      mockGatewaySuccess([
        { title: "Piranesi", creator: "Susanna Clarke", year: 2020, description: "A book", reason: "Great" },
        { title: "Klara and the Sun", creator: "Kazuo Ishiguro", year: 2021, description: "A book 2", reason: "Also great" },
      ]);
      mockResolverSuccess();

      const res = await POST(makeRequest({ shelfId: "books", items: SAMPLE_BOOKS }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.cards)).toBe(true);
    });

    it("prefers the resolver's verified author over the LLM creator in the subtitle", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabaseQuery([]);
      // LLM hallucinates the author ("Tom DeLonge" for The Gone World).
      mockGatewaySuccess([
        { title: "The Gone World", creator: "Tom DeLonge", year: 2018, description: "Desc", reason: "Reason" },
      ]);
      vi.mocked(resolveBookWithOpenLibrary).mockResolvedValue({
        canonical_url: "https://openlibrary.org/works/OLgoneW",
        cover_url: null,
        confirmed_year: 2018,
        verified_author: "Tom Sweterlitsch",
      });

      const res = await POST(makeRequest({ shelfId: "books", items: SAMPLE_BOOKS }));
      const body = await res.json();
      expect(body.cards[0].subtitle).toContain("Tom Sweterlitsch");
      expect(body.cards[0].subtitle).not.toContain("Tom DeLonge");
    });

    it("deduplicates against existing library titles", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabaseQuery(["Piranesi"]);
      mockGatewaySuccess([
        { title: "Piranesi", creator: "Susanna Clarke", year: 2020, description: "A book", reason: "Great" },
        { title: "Klara and the Sun", creator: "Kazuo Ishiguro", year: 2021, description: "A book 2", reason: "Also great" },
      ]);
      mockResolverSuccess();

      const res = await POST(makeRequest({ shelfId: "books", items: SAMPLE_BOOKS }));
      expect(res.status).toBe(200);
      const body = await res.json();
      // Piranesi should be filtered out
      expect(body.cards.map((c: { title: string }) => c.title)).not.toContain("Piranesi");
    });

    it("drops unresolved candidates gracefully (returns what survived)", async () => {
      vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
      mockSupabaseQuery([]);
      mockGatewaySuccess([
        { title: "A Real Book", creator: "Real Author", year: 2020, description: "Desc", reason: "Reason" },
      ]);
      // Resolver returns null for all
      vi.mocked(resolveBookWithOpenLibrary).mockResolvedValue(null);

      const res = await POST(makeRequest({ shelfId: "books", items: SAMPLE_BOOKS }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cards).toHaveLength(0);
    });
  });
});

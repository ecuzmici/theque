/**
 * Tests for the request-free recommendation pipeline.
 *
 * Covers the seam that POST /api/recommend and session-less callers (cron) share:
 * the injected Supabase client is the one used, every query is scoped to the
 * passed `userId`, and an empty run is a success (ADR 0016), not a throw.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/recommend/resolve/open-library", () => ({
  resolveBookWithOpenLibrary: vi.fn(),
}));

vi.mock("@/lib/recommend/resolve/tmdb", () => ({
  resolveMovieWithTmdb: vi.fn(),
  fetchTmdbCardExtras: vi.fn(),
  formatWatchLength: vi.fn(),
}));

vi.mock("@/lib/recommend/resolve/google-books", () => ({
  fetchBookDescription: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/ai/gateway", () => ({
  generateJsonWithFallback: vi.fn(),
}));

import type { SupabaseClient } from "@supabase/supabase-js";

import { generateJsonWithFallback } from "@/lib/ai/gateway";
import type { Database } from "@/lib/database.types";
import { generateRecommendations } from "@/lib/recommend/generate";
import { resolveBookWithOpenLibrary } from "@/lib/recommend/resolve/open-library";

const USER_ID = "user-123";

const LIBRARY_ITEMS = Array.from({ length: 5 }, (_, i) => ({
  title: `Book ${i}`,
  status: "want" as const,
  rating_personal: null,
  verdict: null,
  structured: { authors: [`Author ${i}`], published_year: 2000 + i },
  category: "books" as const,
}));

type FakeDb = {
  client: SupabaseClient<Database>;
  /** Every `.eq(column, value)` seen, per table. */
  filters: Record<string, Array<[string, unknown]>>;
  insertedRows: Array<Record<string, unknown>>;
};

function fakeSupabase(options: {
  libraryItems?: typeof LIBRARY_ITEMS;
  libraryError?: { message: string } | null;
  outcomes?: Array<{ title_norm: string; outcome: string; shown_at: string }>;
  outcomesError?: { message: string } | null;
  insertError?: { message: string } | null;
}): FakeDb {
  const {
    libraryItems = LIBRARY_ITEMS,
    libraryError = null,
    outcomes = [],
    outcomesError = null,
    insertError = null,
  } = options;

  const filters: Record<string, Array<[string, unknown]>> = {
    items: [],
    recommendation_outcomes: [],
  };
  const insertedRows: Array<Record<string, unknown>> = [];

  const client = {
    from(table: string) {
      const record = (column: string, value: unknown) => {
        filters[table].push([column, value]);
      };

      if (table === "items") {
        const builder = {
          select: () => builder,
          eq: (column: string, value: unknown) => {
            record(column, value);
            return builder;
          },
          in: (column: string, value: unknown) => {
            record(column, value);
            return Promise.resolve({
              data: libraryError ? null : libraryItems,
              error: libraryError,
            });
          },
        };
        return builder;
      }

      if (table === "recommendation_outcomes") {
        let eqCount = 0;
        const builder = {
          select: () => builder,
          eq: (column: string, value: unknown) => {
            record(column, value);
            eqCount += 1;
            // The outcomes read filters on user_id then category.
            if (eqCount < 2) return builder;
            return Promise.resolve({
              data: outcomesError ? null : outcomes,
              error: outcomesError,
            });
          },
          insert: (rows: Array<Record<string, unknown>>) => {
            insertedRows.push(...rows);
            return {
              select: () =>
                Promise.resolve({
                  data: insertError
                    ? null
                    : rows.map((r, i) => ({ id: `outcome-${i}`, title_norm: r.title_norm })),
                  error: insertError,
                }),
            };
          },
        };
        return builder;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient<Database>;

  return { client, filters, insertedRows };
}

function mockGateway(candidates: unknown[]) {
  vi.mocked(generateJsonWithFallback).mockResolvedValue({
    data: { candidates },
    model: "google/gemini-3.6-flash",
  });
}

function mockResolverSuccess() {
  vi.mocked(resolveBookWithOpenLibrary).mockResolvedValue({
    canonical_url: "https://openlibrary.org/works/OL12345W",
    cover_url: null,
    confirmed_year: 2020,
    external_id: "OL12345W",
    verified_author: null,
  });
}

function run(db: FakeDb, overrides: Partial<Parameters<typeof generateRecommendations>[0]> = {}) {
  return generateRecommendations({
    userId: USER_ID,
    shelfId: "books",
    supabase: db.client,
    region: "US",
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateRecommendations", () => {
  describe("user scoping", () => {
    it("filters every read by the passed userId", async () => {
      const db = fakeSupabase({});
      mockGateway([]);
      mockResolverSuccess();

      await run(db);

      expect(db.filters.items).toContainEqual(["user_id", USER_ID]);
      expect(db.filters.recommendation_outcomes).toContainEqual(["user_id", USER_ID]);
    });

    it("stamps user_id on every shown outcome row it writes", async () => {
      const db = fakeSupabase({});
      mockGateway([
        {
          title: "Piranesi",
          creator: "Susanna Clarke",
          year: 2020,
          description: "A book",
          reason: "Great",
        },
      ]);
      mockResolverSuccess();

      const result = await run(db);

      expect(result.ok).toBe(true);
      expect(db.insertedRows.length).toBeGreaterThan(0);
      for (const row of db.insertedRows) {
        expect(row.user_id).toBe(USER_ID);
        expect(row.category).toBe("books");
        expect(row.outcome).toBe("shown");
      }
    });

    it("uses only the injected client — no session lookup", async () => {
      const db = fakeSupabase({});
      const fromSpy = vi.spyOn(db.client, "from");
      mockGateway([]);
      mockResolverSuccess();

      await run(db);

      expect(fromSpy).toHaveBeenCalledWith("items");
      expect(fromSpy).toHaveBeenCalledWith("recommendation_outcomes");
    });
  });

  describe("empty runs are a success (ADR 0016)", () => {
    it("returns cards: [] with reason=transient when nothing resolves", async () => {
      const db = fakeSupabase({});
      mockGateway([
        { title: "A Real Book", creator: "Real Author", year: 2020, description: "D", reason: "R" },
      ]);
      vi.mocked(resolveBookWithOpenLibrary).mockResolvedValue(null);

      const result = await run(db);

      expect(result).toEqual(
        expect.objectContaining({ ok: true, cards: [], reason: "transient" }),
      );
      expect(db.insertedRows).toHaveLength(0);
    });

    it("returns cards: [] with reason=exhausted when a full batch is all owned", async () => {
      const db = fakeSupabase({});
      mockGateway(
        LIBRARY_ITEMS.map((item, i) => ({
          title: item.title,
          creator: `Author ${i}`,
          year: 2000 + i,
          description: "D",
          reason: "R",
        })),
      );
      mockResolverSuccess();

      const result = await run(db);

      expect(result).toEqual(
        expect.objectContaining({ ok: true, cards: [], reason: "exhausted" }),
      );
    });

    it("returns cards: [] when the LLM produces nothing at all", async () => {
      const db = fakeSupabase({});
      mockGateway([]);
      mockResolverSuccess();

      const result = await run(db);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.cards).toEqual([]);
    });
  });

  describe("failures come back as codes, not throws", () => {
    it("reports library_query_failed", async () => {
      const db = fakeSupabase({ libraryError: { message: "boom" } });
      const result = await run(db);
      expect(result).toEqual({ ok: false, code: "library_query_failed" });
    });

    it("reports insufficient_items below the minimum", async () => {
      const db = fakeSupabase({ libraryItems: [LIBRARY_ITEMS[0]] as typeof LIBRARY_ITEMS });
      const result = await run(db);
      expect(result).toEqual({ ok: false, code: "insufficient_items" });
    });

    it("reports outcomes_query_failed", async () => {
      const db = fakeSupabase({ outcomesError: { message: "boom" } });
      const result = await run(db);
      expect(result).toEqual({ ok: false, code: "outcomes_query_failed" });
    });

    it("reports llm_failed when every gateway model fails", async () => {
      const db = fakeSupabase({});
      vi.mocked(generateJsonWithFallback).mockRejectedValue(new Error("all_models_failed"));
      const result = await run(db);
      expect(result).toEqual({ ok: false, code: "llm_failed" });
    });

    it("reports outcome_insert_failed", async () => {
      const db = fakeSupabase({ insertError: { message: "boom" } });
      mockGateway([
        { title: "Piranesi", creator: "Susanna Clarke", year: 2020, description: "D", reason: "R" },
      ]);
      mockResolverSuccess();
      const result = await run(db);
      expect(result).toEqual({ ok: false, code: "outcome_insert_failed" });
    });
  });

  describe("card shaping", () => {
    it("returns cards carrying the inserted outcome_id and a composed subtitle", async () => {
      const db = fakeSupabase({});
      mockGateway([
        {
          title: "Piranesi",
          creator: "Susanna Clarke",
          year: 2020,
          description: "A book",
          reason: "Great",
        },
      ]);
      mockResolverSuccess();

      const result = await run(db);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].outcome_id).toBe("outcome-0");
      expect(result.cards[0].subtitle).toBe("Susanna Clarke · 2020");
      expect(result.funnel.final).toBe(1);
      // Internal draft fields must not leak into the card.
      expect(result.cards[0]).not.toHaveProperty("external_id");
      expect(result.cards[0]).not.toHaveProperty("title_norm");
    });

    it("honours a caller-supplied count", async () => {
      const db = fakeSupabase({});
      mockGateway([
        { title: "Piranesi", creator: "Susanna Clarke", year: 2020, description: "D", reason: "R" },
        { title: "Klara and the Sun", creator: "Kazuo Ishiguro", year: 2021, description: "D", reason: "R" },
      ]);
      mockResolverSuccess();

      const result = await run(db, { count: 1 });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.cards).toHaveLength(1);
      expect(db.insertedRows).toHaveLength(1);
    });
  });
});

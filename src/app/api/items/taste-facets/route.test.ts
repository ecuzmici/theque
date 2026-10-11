import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

/** A thenable chain stub, like the Postgrest builder. */
function makeQuery(rows: Record<string, unknown>[], error: { message: string } | null = null) {
  const query: Record<string, unknown> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    in: vi.fn(() => query),
    lt: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    then: (resolve: (result: { data: unknown; error: unknown }) => void) =>
      resolve({ data: error ? null : rows, error }),
  };
  return query;
}

async function call(search: string) {
  const { GET } = await import("./route");
  return GET(new Request(`https://theque.app/api/items/taste-facets${search}`));
}

describe("GET /api/items/taste-facets (ADR 0020)", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSessionUserOrNull.mockReset();
    mocks.from.mockReset();
    mocks.getSessionUserOrNull.mockResolvedValue({ id: "user-1" });
  });

  it("returns 401 without a session", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(null);
    const res = await call("?shelf=books");
    expect(res.status).toBe(401);
  });

  it.each(["", "?shelf=all", "?shelf=read", "?shelf=other", "?shelf=nope"])(
    "returns 400 for %j",
    async (search) => {
      const res = await call(search);
      expect(res.status).toBe(400);
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it("counts genres and moods, sorts by count then list order, and drops zero counts", async () => {
    const query = makeQuery([
      { genre_keys: ["scifi", "fantasy"], mood_keys: ["epic"] },
      { genre_keys: ["scifi"], mood_keys: ["epic", "dark"] },
      { genre_keys: ["horror"], mood_keys: [] },
      { genre_keys: ["fantasy"], mood_keys: ["cozy"] },
      { genre_keys: [], mood_keys: [] },
    ]);
    mocks.from.mockReturnValue(query);

    const res = await call("?shelf=books");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      genres: [
        { key: "fantasy", label: "Fantasy", count: 2 },
        { key: "scifi", label: "Sci-Fi", count: 2 },
        { key: "horror", label: "Horror", count: 1 },
      ],
      moods: [
        { key: "epic", label: "Epic", count: 2 },
        { key: "cozy", label: "Cozy", count: 1 },
        { key: "dark", label: "Dark", count: 1 },
      ],
    });
  });

  it("uses the shelf rules of the watch shelf", async () => {
    const query = makeQuery([{ genre_keys: ["scifi-fantasy"], mood_keys: [] }]);
    mocks.from.mockReturnValue(query);

    const res = await call("?shelf=watch");
    expect(res.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.neq).toHaveBeenCalledWith("status", "dismissed");
    expect(query.in).toHaveBeenCalledWith("category", ["movies_and_tv"]);
    expect((await res.json()).genres).toEqual([
      { key: "scifi-fantasy", label: "Sci-Fi & Fantasy", count: 1 },
    ]);
  });

  it("ignores keys that are not in the list of the shelf", async () => {
    const query = makeQuery([
      { genre_keys: ["scifi", "nonsense"], mood_keys: ["spicy", "eerie"] },
      { genre_keys: ["scifi-fantasy"], mood_keys: null },
      { genre_keys: null, mood_keys: ["eerie", "eerie"] },
    ]);
    mocks.from.mockReturnValue(query);

    const res = await call("?shelf=watch");
    expect(await res.json()).toEqual({
      genres: [{ key: "scifi-fantasy", label: "Sci-Fi & Fantasy", count: 1 }],
      moods: [{ key: "eerie", label: "Eerie", count: 2 }],
    });
  });

  it("returns empty lists for an empty shelf", async () => {
    mocks.from.mockReturnValue(makeQuery([]));
    const res = await call("?shelf=books");
    expect(await res.json()).toEqual({ genres: [], moods: [] });
  });

  it("returns 500 when the query fails", async () => {
    mocks.from.mockReturnValue(makeQuery([], { message: "boom" }));
    const res = await call("?shelf=books");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ code: "query_failed" });
  });
});

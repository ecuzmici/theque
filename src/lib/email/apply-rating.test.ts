import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { applyRatingFromLink } from "@/lib/email/apply-rating";
import type { RatingLinkPayload } from "@/lib/email/rating-link";

const ITEM_ID = "11111111-2222-4333-8444-555555555555";
const USER_ID = "99999999-8888-4777-8666-555555555555";
const NOW_MS = Date.UTC(2026, 0, 1, 12, 0, 0);
const NOW_ISO = new Date(NOW_MS).toISOString();

const PAYLOAD: RatingLinkPayload = {
  itemId: ITEM_ID,
  userId: USER_ID,
  stars: 4,
  expiresAtSeconds: Math.floor(NOW_MS / 1000) + 3600,
};

type Row = {
  id: string;
  title: string | null;
  domain: string;
  category: string | null;
  status: string;
  rating_personal: number | null;
  done_at: string | null;
};

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: ITEM_ID,
    title: "Dune",
    domain: "goodreads.com",
    category: "books",
    status: "want",
    rating_personal: null,
    done_at: null,
    ...overrides,
  };
}

/**
 * Minimal stand-in for the chained supabase query builder. Records the filters
 * and the update patch so the tests can assert on user scoping and on which
 * columns this flow is allowed to touch.
 */
function stubAdmin({
  data,
  loadError,
  updateError,
}: {
  data?: Row | null;
  loadError?: { message: string };
  updateError?: { message: string };
} = {}) {
  const state = {
    updates: [] as Record<string, unknown>[],
    loadFilters: [] as [string, unknown][],
    updateFilters: [] as [string, unknown][],
  };
  let mode: "select" | "update" = "select";

  const query = {
    select() {
      return query;
    },
    update(patch: Record<string, unknown>) {
      mode = "update";
      state.updates.push(patch);
      return query;
    },
    eq(column: string, value: unknown) {
      (mode === "update" ? state.updateFilters : state.loadFilters).push([column, value]);
      return query;
    },
    async maybeSingle() {
      if (mode === "update") {
        if (updateError) return { data: null, error: updateError };
        return { data: { ...(data as Row), ...state.updates.at(-1) }, error: null };
      }
      if (loadError) return { data: null, error: loadError };
      return { data: data ?? null, error: null };
    },
  };

  mocks.createAdminClient.mockReturnValue({
    from() {
      mode = "select";
      return query;
    },
  });

  return state;
}

beforeEach(() => {
  mocks.createAdminClient.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("applyRatingFromLink", () => {
  it("marks a wanted item done with the rating and a fresh done_at", async () => {
    const state = stubAdmin({ data: row() });

    const result = await applyRatingFromLink(PAYLOAD, NOW_MS);

    expect(result.ok).toBe(true);
    expect(state.updates).toEqual([
      { rating_personal: 4, status: "done", done_at: NOW_ISO },
    ]);
    if (result.ok) {
      expect(result.item.rating_personal).toBe(4);
      expect(result.item.status).toBe("done");
    }
  });

  it("only ever writes the star, the status, and the timestamp (never verdict or note)", async () => {
    const state = stubAdmin({ data: row() });

    await applyRatingFromLink(PAYLOAD, NOW_MS);

    expect(Object.keys(state.updates[0]).sort()).toEqual(["done_at", "rating_personal", "status"]);
  });

  it("scopes both the read and the write by id AND user_id", async () => {
    const state = stubAdmin({ data: row() });

    await applyRatingFromLink(PAYLOAD, NOW_MS);

    expect(state.loadFilters).toEqual([
      ["id", ITEM_ID],
      ["user_id", USER_ID],
    ]);
    expect(state.updateFilters).toEqual([
      ["id", ITEM_ID],
      ["user_id", USER_ID],
    ]);
  });

  it("is a no-op when the same link is visited again", async () => {
    const alreadyRated = row({ status: "done", rating_personal: 4, done_at: "2025-12-01T00:00:00.000Z" });
    const state = stubAdmin({ data: alreadyRated });

    const result = await applyRatingFromLink(PAYLOAD, NOW_MS);

    expect(result).toEqual({ ok: true, item: alreadyRated });
    expect(state.updates).toEqual([]);
  });

  it("keeps the original done_at when correcting the rating", async () => {
    const firstDoneAt = "2025-12-01T00:00:00.000Z";
    const state = stubAdmin({ data: row({ status: "done", rating_personal: 2, done_at: firstDoneAt }) });

    const result = await applyRatingFromLink(PAYLOAD, NOW_MS);

    expect(result.ok).toBe(true);
    expect(state.updates[0]).toEqual({
      rating_personal: 4,
      status: "done",
      done_at: firstDoneAt,
    });
  });

  it("reports not_found when the item is gone or belongs to another profile", async () => {
    stubAdmin({ data: null });

    await expect(applyRatingFromLink(PAYLOAD, NOW_MS)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("reports write_failed when the read errors", async () => {
    stubAdmin({ data: row(), loadError: { message: "boom" } });

    await expect(applyRatingFromLink(PAYLOAD, NOW_MS)).resolves.toEqual({
      ok: false,
      reason: "write_failed",
    });
  });

  it("reports write_failed when the update errors", async () => {
    stubAdmin({ data: row(), updateError: { message: "boom" } });

    await expect(applyRatingFromLink(PAYLOAD, NOW_MS)).resolves.toEqual({
      ok: false,
      reason: "write_failed",
    });
  });

  it("reports server_misconfigured when the admin client cannot be built", async () => {
    mocks.createAdminClient.mockImplementation(() => {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    });

    await expect(applyRatingFromLink(PAYLOAD, NOW_MS)).resolves.toEqual({
      ok: false,
      reason: "server_misconfigured",
    });
  });
});

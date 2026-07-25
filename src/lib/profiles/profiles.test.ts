import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { DEFAULT_DIGEST_PREFERENCES, type ProfileRow } from "./digest-preferences";
import {
  disableDigestByUnsubscribeToken,
  fetchDigestPreferences,
  fetchProfile,
  listProfilesDueForDigest,
  markDigestSent,
  updateDigestPreferences,
  type ProfilesDb,
} from "./profiles";

const DAY_MS = 86_400_000;
/** 2026-07-26 is a Sunday (getUTCDay() === 0). */
const SUNDAY = new Date(Date.UTC(2026, 6, 26, 9, 0, 0));

function makeProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    user_id: "user-1",
    email: "reader@example.com",
    digest_enabled: true,
    digest_day: 0,
    unsubscribe_token: "token-1",
    last_digest_sent_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

type QueryResult = { data: unknown; error: { message: string } | null };
type Call = { method: string; args: unknown[] };

/**
 * Minimal stand-in for the PostgREST builder: every chainable method records
 * its call and returns the same thenable object, which resolves to the
 * configured result whether the caller awaits the chain directly
 * (`markDigestSent`) or ends it with `maybeSingle()`.
 */
function makeFakeDb(result: QueryResult) {
  const calls: Call[] = [];
  const record = (method: string, args: unknown[]) => calls.push({ method, args });

  const chain: Record<string, unknown> = {
    then(onFulfilled?: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
    maybeSingle: (...args: unknown[]) => {
      record("maybeSingle", args);
      return Promise.resolve(result);
    },
  };

  for (const method of ["select", "update", "eq", "not", "or", "order", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      record(method, args);
      return chain;
    };
  }

  const db = {
    from: (table: string) => {
      record("from", [table]);
      return chain;
    },
  };

  const argsFor = (method: string) => calls.find((call) => call.method === method)?.args;

  return { db: db as unknown as ProfilesDb, calls, argsFor };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("fetchProfile", () => {
  it("returns the row scoped to the requested user", async () => {
    const row = makeProfile();
    const { db, argsFor } = makeFakeDb({ data: row, error: null });

    await expect(fetchProfile(db, "user-1")).resolves.toEqual(row);
    expect(argsFor("from")).toEqual(["profiles"]);
    expect(argsFor("eq")).toEqual(["user_id", "user-1"]);
  });

  it("returns null instead of throwing when the query fails", async () => {
    const { db } = makeFakeDb({ data: null, error: { message: "relation does not exist" } });
    await expect(fetchProfile(db, "user-1")).resolves.toBeNull();
  });
});

describe("fetchDigestPreferences", () => {
  it("reads the stored preferences", async () => {
    const { db } = makeFakeDb({
      data: makeProfile({ digest_enabled: false, digest_day: 3 }),
      error: null,
    });
    await expect(fetchDigestPreferences(db, "user-1")).resolves.toEqual({
      digest_enabled: false,
      digest_day: 3,
    });
  });

  it("falls back to defaults when the profile row is missing", async () => {
    const { db } = makeFakeDb({ data: null, error: null });
    await expect(fetchDigestPreferences(db, "user-1")).resolves.toEqual(
      DEFAULT_DIGEST_PREFERENCES,
    );
  });
});

describe("updateDigestPreferences", () => {
  it("writes only the patched columns for the given user and returns the saved row", async () => {
    const { db, argsFor } = makeFakeDb({
      data: makeProfile({ digest_enabled: false }),
      error: null,
    });

    const result = await updateDigestPreferences(db, "user-1", { digest_enabled: false });

    expect(result).toEqual({
      ok: true,
      preferences: { digest_enabled: false, digest_day: 0 },
    });
    expect(argsFor("update")).toEqual([{ digest_enabled: false }]);
    expect(argsFor("eq")).toEqual(["user_id", "user-1"]);
  });

  it("reports failure when the write errors", async () => {
    const { db } = makeFakeDb({ data: null, error: { message: "permission denied" } });
    const result = await updateDigestPreferences(db, "user-1", { digest_day: 2 });
    expect(result.ok).toBe(false);
  });

  it("reports failure when no row matched (profile not created yet)", async () => {
    const { db } = makeFakeDb({ data: null, error: null });
    const result = await updateDigestPreferences(db, "user-1", { digest_enabled: true });
    expect(result.ok).toBe(false);
  });
});

describe("listProfilesDueForDigest", () => {
  it("queries only enabled profiles for today's weekday and maps them to recipients", async () => {
    const rows = [makeProfile(), makeProfile({ user_id: "user-2", email: "b@example.com" })];
    const { db, calls } = makeFakeDb({ data: rows, error: null });

    const due = await listProfilesDueForDigest(db, { now: SUNDAY });

    expect(due).toEqual([
      {
        user_id: "user-1",
        email: "reader@example.com",
        unsubscribe_token: "token-1",
        digest_day: 0,
        last_digest_sent_at: null,
      },
      {
        user_id: "user-2",
        email: "b@example.com",
        unsubscribe_token: "token-1",
        digest_day: 0,
        last_digest_sent_at: null,
      },
    ]);

    const eqCalls = calls.filter((call) => call.method === "eq").map((call) => call.args);
    expect(eqCalls).toEqual([
      ["digest_enabled", true],
      ["digest_day", SUNDAY.getUTCDay()],
    ]);
  });

  it("drops rows the cadence rule rejects even if SQL returned them", async () => {
    const rows = [
      makeProfile({ user_id: "fresh", last_digest_sent_at: new Date(SUNDAY.getTime() - DAY_MS).toISOString() }),
      makeProfile({ user_id: "no-email", email: null }),
      makeProfile({ user_id: "keep" }),
    ];
    const { db } = makeFakeDb({ data: rows, error: null });

    const due = await listProfilesDueForDigest(db, { now: SUNDAY });

    expect(due.map((recipient) => recipient.user_id)).toEqual(["keep"]);
  });

  it("returns an empty list when the query fails", async () => {
    const { db } = makeFakeDb({ data: null, error: { message: "boom" } });
    await expect(listProfilesDueForDigest(db, { now: SUNDAY })).resolves.toEqual([]);
  });
});

describe("markDigestSent", () => {
  it("stamps last_digest_sent_at for the user", async () => {
    const { db, argsFor } = makeFakeDb({ data: null, error: null });

    await expect(markDigestSent(db, "user-1", SUNDAY)).resolves.toBe(true);
    expect(argsFor("update")).toEqual([{ last_digest_sent_at: SUNDAY.toISOString() }]);
    expect(argsFor("eq")).toEqual(["user_id", "user-1"]);
  });

  it("reports failure when the write errors", async () => {
    const { db } = makeFakeDb({ data: null, error: { message: "boom" } });
    await expect(markDigestSent(db, "user-1", SUNDAY)).resolves.toBe(false);
  });
});

describe("disableDigestByUnsubscribeToken", () => {
  it("turns the letter off for the row matching the token", async () => {
    const { db, argsFor } = makeFakeDb({ data: { user_id: "user-1" }, error: null });

    await expect(disableDigestByUnsubscribeToken(db, "token-1")).resolves.toBe(true);
    expect(argsFor("update")).toEqual([{ digest_enabled: false }]);
    expect(argsFor("eq")).toEqual(["unsubscribe_token", "token-1"]);
  });

  it("reports failure for an unknown token", async () => {
    const { db } = makeFakeDb({ data: null, error: null });
    await expect(disableDigestByUnsubscribeToken(db, "nope")).resolves.toBe(false);
  });

  it("never queries for a blank token", async () => {
    const { db, calls } = makeFakeDb({ data: null, error: null });
    await expect(disableDigestByUnsubscribeToken(db, "   ")).resolves.toBe(false);
    expect(calls).toEqual([]);
  });
});

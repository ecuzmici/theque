import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { DEFAULT_DIGEST_PREFERENCES, type ProfileRow } from "./digest-preferences";
import { SOFT_BOUNCE_SUPPRESSION_THRESHOLD } from "./digest-suppression";
import {
  applyDeliverabilitySignal,
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
    ai_personalization_enabled: false,
    unsubscribe_token: "token-1",
    last_digest_sent_at: null,
    digest_suppressed_at: null,
    digest_suppression_reason: null,
    digest_soft_bounce_count: 0,
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

  for (const method of [
    "select",
    "update",
    "insert",
    "delete",
    "eq",
    "is",
    "ilike",
    "not",
    "or",
    "order",
    "limit",
  ]) {
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
      data: makeProfile({
        digest_enabled: false,
        digest_day: 3,
        ai_personalization_enabled: true,
      }),
      error: null,
    });
    await expect(fetchDigestPreferences(db, "user-1")).resolves.toEqual({
      digest_enabled: false,
      digest_day: 3,
      ai_personalization_enabled: true,
    });
  });

  it("reports no AI consent when the row predates the consent column", async () => {
    const legacy = makeProfile();
    delete (legacy as Partial<ProfileRow>).ai_personalization_enabled;
    const { db } = makeFakeDb({ data: legacy, error: null });

    await expect(fetchDigestPreferences(db, "user-1")).resolves.toMatchObject({
      ai_personalization_enabled: false,
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
      preferences: { digest_enabled: false, digest_day: 0, ai_personalization_enabled: false },
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
    const rows = [
      makeProfile({ ai_personalization_enabled: true }),
      makeProfile({ user_id: "user-2", email: "b@example.com" }),
    ];
    const { db, calls } = makeFakeDb({ data: rows, error: null });

    const due = await listProfilesDueForDigest(db, { now: SUNDAY });

    expect(due).toEqual([
      {
        user_id: "user-1",
        email: "reader@example.com",
        unsubscribe_token: "token-1",
        digest_day: 0,
        last_digest_sent_at: null,
        ai_personalization_enabled: true,
      },
      {
        user_id: "user-2",
        email: "b@example.com",
        unsubscribe_token: "token-1",
        digest_day: 0,
        last_digest_sent_at: null,
        ai_personalization_enabled: false,
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

  it("treats a row without the consent column as not consented", async () => {
    const legacy = makeProfile();
    delete (legacy as Partial<ProfileRow>).ai_personalization_enabled;
    const { db } = makeFakeDb({ data: [legacy], error: null });

    const [due] = await listProfilesDueForDigest(db, { now: SUNDAY });
    expect(due.ai_personalization_enabled).toBe(false);
  });

  it("asks SQL for unsuppressed profiles only", async () => {
    const { db, calls } = makeFakeDb({ data: [], error: null });

    await listProfilesDueForDigest(db, { now: SUNDAY });

    const isCalls = calls.filter((call) => call.method === "is").map((call) => call.args);
    expect(isCalls).toContainEqual(["digest_suppressed_at", null]);
  });

  it("drops suppressed profiles even if SQL returned them", async () => {
    const rows = [
      makeProfile({
        user_id: "bounced",
        digest_suppressed_at: "2026-07-20T00:00:00.000Z",
        digest_suppression_reason: "hard_bounce",
      }),
      makeProfile({
        user_id: "complained",
        digest_suppressed_at: "2026-07-21T00:00:00.000Z",
        digest_suppression_reason: "complaint",
      }),
      makeProfile({ user_id: "keep" }),
    ];
    const { db } = makeFakeDb({ data: rows, error: null });

    const due = await listProfilesDueForDigest(db, { now: SUNDAY });

    expect(due.map((recipient) => recipient.user_id)).toEqual(["keep"]);
  });

  it("keeps a row from before the suppression migration", async () => {
    const legacy = makeProfile();
    delete (legacy as Partial<ProfileRow>).digest_suppressed_at;
    const { db } = makeFakeDb({ data: [legacy], error: null });

    await expect(listProfilesDueForDigest(db, { now: SUNDAY })).resolves.toHaveLength(1);
  });
});

describe("applyDeliverabilitySignal", () => {
  const NOW = new Date("2026-07-25T12:00:00.000Z");

  function deliverabilityDb(row: Partial<ProfileRow> | null) {
    return makeFakeDb({ data: row ? [makeProfile(row)] : [], error: null });
  }

  it("matches the address case-insensitively and escapes LIKE wildcards", async () => {
    const { db, argsFor } = deliverabilityDb({ email: "Reader@Example.com" });

    await expect(
      applyDeliverabilitySignal(db, {
        email: " READER@Example.com ",
        signal: "hard_bounce",
        now: NOW,
      }),
    ).resolves.toBe("suppressed");

    expect(argsFor("ilike")).toEqual(["email", "reader@example.com"]);
  });

  it("escapes underscores so a wildcard cannot widen the match", async () => {
    const { db, argsFor } = deliverabilityDb({ email: "a_b@example.com" });

    await applyDeliverabilitySignal(db, {
      email: "a_b@example.com",
      signal: "delivered",
      now: NOW,
    });

    expect(argsFor("ilike")).toEqual(["email", "a\\_b@example.com"]);
  });

  it("never acts on a row whose address only looked like a match", async () => {
    // Stands in for PostgREST's `*` → `%` rewrite: SQL over-returns, the
    // TypeScript re-check is what decides.
    const { db, calls } = deliverabilityDb({ email: "someone-else@example.com" });

    await expect(
      applyDeliverabilitySignal(db, { email: "reader@example.com", signal: "complaint", now: NOW }),
    ).resolves.toBe("no_match");

    expect(calls.some((call) => call.method === "update")).toBe(false);
  });

  it("reports no match for an unknown address without writing", async () => {
    const { db, calls } = deliverabilityDb(null);

    await expect(
      applyDeliverabilitySignal(db, { email: "nobody@example.com", signal: "hard_bounce", now: NOW }),
    ).resolves.toBe("no_match");
    expect(calls.some((call) => call.method === "update")).toBe(false);
  });

  it("suppresses immediately on a hard bounce", async () => {
    const { db, argsFor } = deliverabilityDb({});

    await expect(
      applyDeliverabilitySignal(db, { email: "reader@example.com", signal: "hard_bounce", now: NOW }),
    ).resolves.toBe("suppressed");

    expect(argsFor("update")).toEqual([
      { digest_suppressed_at: NOW.toISOString(), digest_suppression_reason: "hard_bounce" },
    ]);
  });

  it("suppresses immediately on a complaint", async () => {
    const { db, argsFor } = deliverabilityDb({});

    await expect(
      applyDeliverabilitySignal(db, { email: "reader@example.com", signal: "complaint", now: NOW }),
    ).resolves.toBe("suppressed");

    expect(argsFor("update")).toEqual([
      { digest_suppressed_at: NOW.toISOString(), digest_suppression_reason: "complaint" },
    ]);
  });

  it("never touches digest_enabled — suppression is not a preference", async () => {
    const { db, argsFor } = deliverabilityDb({});

    await applyDeliverabilitySignal(db, {
      email: "reader@example.com",
      signal: "complaint",
      now: NOW,
    });

    expect(Object.keys((argsFor("update") as [Record<string, unknown>])[0])).not.toContain(
      "digest_enabled",
    );
  });

  it("upgrades an existing bounce suppression to a complaint", async () => {
    const { db, argsFor } = deliverabilityDb({
      digest_suppressed_at: "2026-07-01T00:00:00.000Z",
      digest_suppression_reason: "hard_bounce",
    });

    await expect(
      applyDeliverabilitySignal(db, { email: "reader@example.com", signal: "complaint", now: NOW }),
    ).resolves.toBe("suppressed");

    // The original timestamp is kept; only the reason is escalated.
    expect(argsFor("update")).toEqual([
      {
        digest_suppressed_at: "2026-07-01T00:00:00.000Z",
        digest_suppression_reason: "complaint",
      },
    ]);
  });

  it("does not downgrade a complaint to a bounce", async () => {
    const { db, calls } = deliverabilityDb({
      digest_suppressed_at: "2026-07-01T00:00:00.000Z",
      digest_suppression_reason: "complaint",
    });

    await expect(
      applyDeliverabilitySignal(db, { email: "reader@example.com", signal: "hard_bounce", now: NOW }),
    ).resolves.toBe("noop");
    expect(calls.some((call) => call.method === "update")).toBe(false);
  });

  it("counts a soft bounce below the threshold", async () => {
    const { db, argsFor } = deliverabilityDb({ digest_soft_bounce_count: 0 });

    await expect(
      applyDeliverabilitySignal(db, { email: "reader@example.com", signal: "soft_bounce", now: NOW }),
    ).resolves.toBe("counted");

    expect(argsFor("update")).toEqual([{ digest_soft_bounce_count: 1 }]);
  });

  it("suppresses when soft bounces reach the threshold", async () => {
    const { db, argsFor } = deliverabilityDb({
      digest_soft_bounce_count: SOFT_BOUNCE_SUPPRESSION_THRESHOLD - 1,
    });

    await expect(
      applyDeliverabilitySignal(db, { email: "reader@example.com", signal: "soft_bounce", now: NOW }),
    ).resolves.toBe("suppressed");

    expect(argsFor("update")).toEqual([
      {
        digest_soft_bounce_count: SOFT_BOUNCE_SUPPRESSION_THRESHOLD,
        digest_suppressed_at: NOW.toISOString(),
        digest_suppression_reason: "repeated_soft_bounce",
      },
    ]);
  });

  it("resets the counter on a delivery, so transient failures cannot accumulate", async () => {
    const { db, argsFor } = deliverabilityDb({ digest_soft_bounce_count: 2 });

    await expect(
      applyDeliverabilitySignal(db, { email: "reader@example.com", signal: "delivered", now: NOW }),
    ).resolves.toBe("reset");

    expect(argsFor("update")).toEqual([{ digest_soft_bounce_count: 0 }]);
  });

  it("skips the write when a delivery finds the counter already zero", async () => {
    const { db, calls } = deliverabilityDb({ digest_soft_bounce_count: 0 });

    await expect(
      applyDeliverabilitySignal(db, { email: "reader@example.com", signal: "delivered", now: NOW }),
    ).resolves.toBe("noop");
    expect(calls.some((call) => call.method === "update")).toBe(false);
  });

  it("does not lift a suppression when a later delivery arrives", async () => {
    const { db, calls } = deliverabilityDb({
      digest_suppressed_at: "2026-07-01T00:00:00.000Z",
      digest_suppression_reason: "complaint",
      digest_soft_bounce_count: 0,
    });

    await expect(
      applyDeliverabilitySignal(db, { email: "reader@example.com", signal: "delivered", now: NOW }),
    ).resolves.toBe("noop");
    expect(calls.some((call) => call.method === "update")).toBe(false);
  });

  it("reports failure when the lookup errors, so the provider retries", async () => {
    const { db } = makeFakeDb({ data: null, error: { message: "boom" } });

    await expect(
      applyDeliverabilitySignal(db, { email: "reader@example.com", signal: "hard_bounce", now: NOW }),
    ).resolves.toBe("failed");
  });

  it("ignores a blank address", async () => {
    const { db, calls } = deliverabilityDb({});

    await expect(
      applyDeliverabilitySignal(db, { email: "   ", signal: "complaint", now: NOW }),
    ).resolves.toBe("no_match");
    expect(calls).toEqual([]);
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

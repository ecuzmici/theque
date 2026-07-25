import { describe, expect, it } from "vitest";

import {
  DEFAULT_DIGEST_PREFERENCES,
  digestDayLabel,
  digestSentCutoff,
  isDigestDue,
  MIN_DIGEST_INTERVAL_DAYS,
  normalizeDigestDay,
  parseDigestPreferencesPatch,
  toDigestPreferences,
  type ProfileRow,
} from "./digest-preferences";

const DAY_MS = 86_400_000;

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

/** 2026-07-26 is a Sunday (getUTCDay() === 0). */
const SUNDAY = new Date(Date.UTC(2026, 6, 26, 9, 0, 0));
const MONDAY = new Date(Date.UTC(2026, 6, 27, 9, 0, 0));

describe("normalizeDigestDay", () => {
  it("accepts integers 0-6 as numbers or numeric strings", () => {
    expect(normalizeDigestDay(0)).toBe(0);
    expect(normalizeDigestDay(6)).toBe(6);
    expect(normalizeDigestDay("3")).toBe(3);
    expect(normalizeDigestDay(" 4 ")).toBe(4);
  });

  it("rejects out-of-range, fractional and non-numeric values", () => {
    for (const bad of [-1, 7, 1.5, "", "  ", "sunday", null, undefined, true, {}, []]) {
      expect(normalizeDigestDay(bad)).toBeNull();
    }
  });
});

describe("digestDayLabel", () => {
  it("names each weekday and falls back for an out-of-range stored value", () => {
    expect(digestDayLabel(0)).toBe("Sunday");
    expect(digestDayLabel(5)).toBe("Friday");
    expect(digestDayLabel(99)).toBe("Sunday");
  });
});

describe("parseDigestPreferencesPatch", () => {
  it("accepts each field on its own and both together", () => {
    expect(parseDigestPreferencesPatch({ digest_enabled: false })).toEqual({
      ok: true,
      patch: { digest_enabled: false },
    });
    expect(parseDigestPreferencesPatch({ digest_day: 2 })).toEqual({
      ok: true,
      patch: { digest_day: 2 },
    });
    expect(parseDigestPreferencesPatch({ digest_enabled: true, digest_day: "6" })).toEqual({
      ok: true,
      patch: { digest_enabled: true, digest_day: 6 },
    });
  });

  it("rejects non-objects, arrays and empty patches", () => {
    expect(parseDigestPreferencesPatch(null)).toEqual({ ok: false, code: "invalid_body" });
    expect(parseDigestPreferencesPatch("nope")).toEqual({ ok: false, code: "invalid_body" });
    expect(parseDigestPreferencesPatch([])).toEqual({ ok: false, code: "invalid_body" });
    expect(parseDigestPreferencesPatch({})).toEqual({ ok: false, code: "invalid_body" });
  });

  it("rejects wrongly typed or out-of-range fields with a specific code", () => {
    expect(parseDigestPreferencesPatch({ digest_enabled: "yes" })).toEqual({
      ok: false,
      code: "invalid_digest_enabled",
    });
    expect(parseDigestPreferencesPatch({ digest_day: 9 })).toEqual({
      ok: false,
      code: "invalid_digest_day",
    });
  });

  it("ignores unknown fields rather than smuggling them into the patch", () => {
    expect(
      parseDigestPreferencesPatch({
        digest_enabled: false,
        unsubscribe_token: "forged",
        user_id: "someone-else",
        last_digest_sent_at: "2020-01-01T00:00:00.000Z",
      }),
    ).toEqual({ ok: true, patch: { digest_enabled: false } });
  });
});

describe("toDigestPreferences", () => {
  it("falls back to the documented defaults when there is no row", () => {
    expect(toDigestPreferences(null)).toEqual(DEFAULT_DIGEST_PREFERENCES);
  });

  it("reads the stored preferences and repairs an out-of-range day", () => {
    expect(toDigestPreferences(makeProfile({ digest_enabled: false, digest_day: 4 }))).toEqual({
      digest_enabled: false,
      digest_day: 4,
    });
    expect(toDigestPreferences(makeProfile({ digest_day: 42 })).digest_day).toBe(0);
  });
});

describe("isDigestDue", () => {
  it("is due on its weekday when it has never been sent", () => {
    expect(isDigestDue(makeProfile(), SUNDAY)).toBe(true);
  });

  it("is not due on any other weekday", () => {
    expect(isDigestDue(makeProfile(), MONDAY)).toBe(false);
  });

  it("is not due when disabled or without an address", () => {
    expect(isDigestDue(makeProfile({ digest_enabled: false }), SUNDAY)).toBe(false);
    expect(isDigestDue(makeProfile({ email: null }), SUNDAY)).toBe(false);
  });

  it("suppresses a second send inside the minimum interval", () => {
    const justSent = new Date(SUNDAY.getTime() - 2 * DAY_MS).toISOString();
    expect(isDigestDue(makeProfile({ last_digest_sent_at: justSent }), SUNDAY)).toBe(false);
  });

  it("is due again once the minimum interval has elapsed", () => {
    const lastWeek = new Date(SUNDAY.getTime() - MIN_DIGEST_INTERVAL_DAYS * DAY_MS).toISOString();
    expect(isDigestDue(makeProfile({ last_digest_sent_at: lastWeek }), SUNDAY)).toBe(true);
  });

  it("treats an unparsable last-sent timestamp as never sent", () => {
    expect(isDigestDue(makeProfile({ last_digest_sent_at: "not-a-date" }), SUNDAY)).toBe(true);
  });
});

describe("digestSentCutoff", () => {
  it("is the minimum interval before now", () => {
    expect(digestSentCutoff(SUNDAY)).toBe(
      new Date(SUNDAY.getTime() - MIN_DIGEST_INTERVAL_DAYS * DAY_MS).toISOString(),
    );
  });
});

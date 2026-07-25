import { describe, expect, it } from "vitest";

import type { ProfileRow } from "./digest-preferences";
import {
  DIGEST_SUPPRESSION_REASONS,
  digestSuppressionCopy,
  isDigestSuppressionReason,
  NOT_SUPPRESSED,
  SOFT_BOUNCE_SUPPRESSION_THRESHOLD,
  toDigestSuppression,
} from "./digest-suppression";

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

describe("toDigestSuppression", () => {
  it("reports a deliverable address as not suppressed", () => {
    expect(toDigestSuppression(makeProfile())).toEqual(NOT_SUPPRESSED);
  });

  it("fails soft to not-suppressed for a missing row", () => {
    expect(toDigestSuppression(null)).toEqual(NOT_SUPPRESSED);
  });

  it("fails soft for a row from before the suppression migration", () => {
    const legacy = makeProfile();
    delete (legacy as Partial<ProfileRow>).digest_suppressed_at;
    delete (legacy as Partial<ProfileRow>).digest_suppression_reason;

    expect(toDigestSuppression(legacy)).toEqual(NOT_SUPPRESSED);
  });

  it.each(DIGEST_SUPPRESSION_REASONS)("reads back the %s reason", (reason) => {
    expect(
      toDigestSuppression(
        makeProfile({
          digest_suppressed_at: "2026-07-20T00:00:00.000Z",
          digest_suppression_reason: reason,
        }),
      ),
    ).toEqual({
      suppressed: true,
      reason,
      suppressedAt: "2026-07-20T00:00:00.000Z",
    });
  });

  it("still reports suppression when the stored reason is unrecognized", () => {
    // Suppression is the safety-relevant half; an unknown reason only costs the
    // user the more specific sentence, never the send-stop itself.
    expect(
      toDigestSuppression(
        makeProfile({
          digest_suppressed_at: "2026-07-20T00:00:00.000Z",
          digest_suppression_reason: "something_new",
        }),
      ),
    ).toEqual({ suppressed: true, reason: null, suppressedAt: "2026-07-20T00:00:00.000Z" });
  });

  it("is independent of digest_enabled", () => {
    expect(
      toDigestSuppression(
        makeProfile({ digest_enabled: false, digest_suppressed_at: null }),
      ).suppressed,
    ).toBe(false);
  });
});

describe("isDigestSuppressionReason", () => {
  it.each(DIGEST_SUPPRESSION_REASONS)("accepts %s", (reason) => {
    expect(isDigestSuppressionReason(reason)).toBe(true);
  });

  it.each([["nonsense"], [null], [undefined], [3], [{}]])("rejects %s", (value) => {
    expect(isDigestSuppressionReason(value)).toBe(false);
  });
});

describe("digestSuppressionCopy", () => {
  it.each([...DIGEST_SUPPRESSION_REASONS, null])("has plain-language copy for %s", (reason) => {
    const copy = digestSuppressionCopy(reason);
    expect(copy.heading.length).toBeGreaterThan(0);
    expect(copy.body.length).toBeGreaterThan(0);
  });

  it("never offers to resume after a spam complaint", () => {
    const { body } = digestSuppressionCopy("complaint");
    expect(body).toMatch(/spam/i);
    expect(body).toMatch(/not start again/i);
    expect(body).not.toMatch(/turn it on|resume the letter/i);
  });

  it("points a bounced address at the fix that actually works", () => {
    expect(digestSuppressionCopy("hard_bounce").body).toMatch(/change the email address/i);
    expect(digestSuppressionCopy("repeated_soft_bounce").body).toMatch(/mailbox/i);
  });
});

describe("SOFT_BOUNCE_SUPPRESSION_THRESHOLD", () => {
  it("is a small positive streak, not a single failure", () => {
    // A one-strike rule would suppress on a mailbox that was briefly full.
    expect(SOFT_BOUNCE_SUPPRESSION_THRESHOLD).toBeGreaterThan(1);
    expect(SOFT_BOUNCE_SUPPRESSION_THRESHOLD).toBeLessThanOrEqual(5);
  });
});

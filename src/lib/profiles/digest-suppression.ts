import type { ProfileRow } from "@/lib/profiles/digest-preferences";

/**
 * Deliverability suppression for the weekly letter — a **server-owned fact**
 * about the address, deliberately kept apart from `digest_enabled`, which is
 * the user's own preference.
 *
 * Reusing `digest_enabled` for suppression would have been one column cheaper
 * and three ways wrong: a bounce would look like the user turned the letter
 * off, the Settings toggle would display a preference nobody set, and a user
 * who flipped it back on would silently resume bouncing at the shared sending
 * domain's expense.
 *
 * No `server-only` here: the type and the copy helpers are read by the Settings
 * client component. Only the *writes* are server-side (`profiles.ts`).
 */

export const DIGEST_SUPPRESSION_REASONS = [
  "hard_bounce",
  "complaint",
  "repeated_soft_bounce",
] as const;

export type DigestSuppressionReason = (typeof DIGEST_SUPPRESSION_REASONS)[number];

/**
 * Consecutive transient bounces, with no delivery in between, before the letter
 * stops.
 *
 * Three, because the letter is weekly: reaching it means roughly three weeks
 * during which the address never once accepted mail, which is well past "the
 * mailbox was full for a day". An `email.delivered` resets the counter to zero,
 * so it only ever measures an unbroken failure streak — without that reset a
 * perfectly healthy address would accumulate stray transient failures across
 * months and eventually suppress itself.
 */
export const SOFT_BOUNCE_SUPPRESSION_THRESHOLD = 3;

export type DigestSuppression = {
  suppressed: boolean;
  reason: DigestSuppressionReason | null;
  /** ISO timestamp, or null when the address is deliverable. */
  suppressedAt: string | null;
};

export const NOT_SUPPRESSED: DigestSuppression = {
  suppressed: false,
  reason: null,
  suppressedAt: null,
};

export function isDigestSuppressionReason(value: unknown): value is DigestSuppressionReason {
  return (
    typeof value === "string" &&
    (DIGEST_SUPPRESSION_REASONS as readonly string[]).includes(value)
  );
}

/**
 * Read suppression off a profile row. Fails soft in the same direction as the
 * other accessors: a missing row, or a row from before this migration landed,
 * reads as *not suppressed* — the letter should never stop because of a lagging
 * schema, only because of a real provider signal.
 */
export function toDigestSuppression(profile: ProfileRow | null): DigestSuppression {
  const suppressedAt = profile?.digest_suppressed_at;
  if (!suppressedAt) return { ...NOT_SUPPRESSED };

  return {
    suppressed: true,
    reason: isDigestSuppressionReason(profile?.digest_suppression_reason)
      ? profile.digest_suppression_reason
      : null,
    suppressedAt,
  };
}

/**
 * What Settings tells the user. Plain language, no jargon, and honest about
 * whether the letter can come back.
 *
 * A complaint gets no "turn it back on" affordance anywhere in the product.
 * A spam report is a recipient-side signal with legal weight behind it, the
 * person operating this Settings page is not necessarily the person (or the
 * automated feedback loop) that filed it, and re-subscribing an address that
 * reported you is the single fastest route to a blocklist. The other two are
 * technical failures of an address, so their copy points at the actual fix.
 */
export function digestSuppressionCopy(reason: DigestSuppressionReason | null): {
  heading: string;
  body: string;
} {
  switch (reason) {
    case "complaint":
      return {
        heading: "The weekly letter has stopped",
        body:
          "Your email provider reported one of these letters as spam, so we stopped sending to this address and will not start again. If that was not intentional, get in touch rather than turning it back on — resuming after a spam report puts every other reader's mail at risk too.",
      };
    case "hard_bounce":
      return {
        heading: "The weekly letter has stopped",
        body:
          "Your mail server rejected this address permanently, so we stopped sending to it. That usually means the address no longer exists or was mistyped. Change the email address on your account and the letter will resume.",
      };
    case "repeated_soft_bounce":
      return {
        heading: "The weekly letter has stopped",
        body:
          "This address turned away several letters in a row — a full mailbox or a mail server that kept refusing. We stopped rather than keep trying. Once the mailbox accepts mail again, change the email address on your account or get in touch and we will resume.",
      };
    default:
      return {
        heading: "The weekly letter has stopped",
        body:
          "We could not deliver to this address, so we stopped sending to it. Check that the address is correct, or get in touch and we will look into it.",
      };
  }
}

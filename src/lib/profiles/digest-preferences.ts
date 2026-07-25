import type { Database } from "@/lib/database.types";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/** The only profile columns a signed-in client may change (see the RLS grants). */
export type DigestPreferences = {
  digest_enabled: boolean;
  digest_day: number;
  /**
   * Consent to send this profile's item titles and verdict notes to the LLM
   * provider so the weekly letter can carry a recommendation card. Opt-in:
   * everything else about the letter works without it, and no LLM call is made
   * for a profile that has not turned it on (ADR 0002).
   */
  ai_personalization_enabled: boolean;
};

/** 0 = Sunday … 6 = Saturday, matching `Date#getUTCDay()` and the DB check constraint. */
export const DIGEST_DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const DEFAULT_DIGEST_DAY = 0;

/**
 * What Settings shows (and what the API returns) when a profile row is missing
 * or unreadable — opt-out, not opt-in, so the letter never silently stops for a
 * user whose row lags behind the migration.
 *
 * `ai_personalization_enabled` is the deliberate exception: it defaults to
 * `false`, so an unreadable row can never be mistaken for consent to send that
 * profile's verdict notes to the LLM.
 */
export const DEFAULT_DIGEST_PREFERENCES: DigestPreferences = {
  digest_enabled: true,
  digest_day: DEFAULT_DIGEST_DAY,
  ai_personalization_enabled: false,
};

/**
 * A profile that already got this week's letter must not get a second one if the
 * cron fires twice on its day. Six days keeps a weekly cadence stable even when
 * runs drift by a few hours.
 */
export const MIN_DIGEST_INTERVAL_DAYS = 6;

const DAY_MS = 86_400_000;

/** Accepts an integer 0-6 (as number or numeric string); anything else is `null`. */
export function normalizeDigestDay(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(n) || n < 0 || n > 6) return null;
  return n;
}

export function digestDayLabel(day: number): string {
  return DIGEST_DAY_LABELS[normalizeDigestDay(day) ?? DEFAULT_DIGEST_DAY];
}

export type DigestPreferencesPatch = Partial<DigestPreferences>;

export type ParsedDigestPreferencesPatch =
  | { ok: true; patch: DigestPreferencesPatch }
  | {
      ok: false;
      code:
        | "invalid_body"
        | "invalid_digest_enabled"
        | "invalid_digest_day"
        | "invalid_ai_personalization_enabled";
    };

/**
 * Validates a PATCH body for the digest preferences. Every field is optional,
 * but an empty patch is rejected so a no-op write never looks like a success.
 */
export function parseDigestPreferencesPatch(body: unknown): ParsedDigestPreferencesPatch {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, code: "invalid_body" };
  }

  const raw = body as Record<string, unknown>;
  const patch: DigestPreferencesPatch = {};

  if (raw.digest_enabled !== undefined) {
    if (typeof raw.digest_enabled !== "boolean") {
      return { ok: false, code: "invalid_digest_enabled" };
    }
    patch.digest_enabled = raw.digest_enabled;
  }

  if (raw.digest_day !== undefined) {
    const day = normalizeDigestDay(raw.digest_day);
    if (day === null) return { ok: false, code: "invalid_digest_day" };
    patch.digest_day = day;
  }

  if (raw.ai_personalization_enabled !== undefined) {
    // Consent is only ever set by an explicit boolean — no truthy strings, no
    // coercion, so a malformed client can neither grant nor forge it.
    if (typeof raw.ai_personalization_enabled !== "boolean") {
      return { ok: false, code: "invalid_ai_personalization_enabled" };
    }
    patch.ai_personalization_enabled = raw.ai_personalization_enabled;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, code: "invalid_body" };
  }

  return { ok: true, patch };
}

/** GET /api/profile/digest and PATCH /api/profile/digest */
export type DigestPreferencesResponseBody = {
  preferences: DigestPreferences;
};

export function toDigestPreferences(profile: ProfileRow | null): DigestPreferences {
  if (!profile) return { ...DEFAULT_DIGEST_PREFERENCES };
  return {
    digest_enabled: profile.digest_enabled,
    digest_day: normalizeDigestDay(profile.digest_day) ?? DEFAULT_DIGEST_DAY,
    // Strict `=== true`: a row read before the consent migration landed has no
    // such column, and "absent" must read as "not consented", never as consent.
    ai_personalization_enabled: profile.ai_personalization_enabled === true,
  };
}

type DigestDueCandidate = Pick<
  ProfileRow,
  "digest_enabled" | "digest_day" | "email" | "last_digest_sent_at"
>;

/**
 * Whether a profile should receive the letter on `now` (UTC): enabled, has an
 * address, it is that profile's weekday, and it has not been sent inside the
 * minimum interval. The digest job (W2) narrows in SQL and then re-checks here.
 */
export function isDigestDue(profile: DigestDueCandidate, now: Date): boolean {
  if (!profile.digest_enabled) return false;
  if (!profile.email) return false;
  if ((normalizeDigestDay(profile.digest_day) ?? DEFAULT_DIGEST_DAY) !== now.getUTCDay()) {
    return false;
  }
  if (!profile.last_digest_sent_at) return true;

  const sentAt = Date.parse(profile.last_digest_sent_at);
  if (Number.isNaN(sentAt)) return true;
  return now.getTime() - sentAt >= MIN_DIGEST_INTERVAL_DAYS * DAY_MS;
}

/** ISO cutoff a `last_digest_sent_at` must predate for a profile to be due again. */
export function digestSentCutoff(now: Date): string {
  return new Date(now.getTime() - MIN_DIGEST_INTERVAL_DAYS * DAY_MS).toISOString();
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { DeliverabilitySignal } from "@/lib/email/resend-webhook";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SOFT_BOUNCE_SUPPRESSION_THRESHOLD } from "@/lib/profiles/digest-suppression";
import {
  DEFAULT_DIGEST_PREFERENCES,
  digestSentCutoff,
  isDigestDue,
  toDigestPreferences,
  type DigestPreferences,
  type DigestPreferencesPatch,
  type ProfileRow,
} from "@/lib/profiles/digest-preferences";

/**
 * Accessors for `public.profiles` — one row per auth user, created by the
 * `handle_new_user()` trigger. Reads/writes on behalf of a signed-in user go
 * through the *session* client so RLS (select-own / update-own) and the
 * column-level UPDATE grant stay the enforcement boundary; the job-facing
 * helpers take an *admin* client because a cron run has no session.
 *
 * Every read fails soft: a missing or unreadable row yields the documented
 * defaults rather than throwing, so Settings still renders for an account whose
 * profile row has not landed yet.
 */

export type ProfilesDb = SupabaseClient<Database>;

const PROFILE_COLUMNS =
  "user_id, email, digest_enabled, digest_day, ai_personalization_enabled, unsubscribe_token, last_digest_sent_at, digest_suppressed_at, digest_suppression_reason, digest_soft_bounce_count, created_at, updated_at";

/** A profile the digest job can actually mail to. */
export type DigestRecipient = {
  user_id: string;
  email: string;
  unsubscribe_token: string;
  digest_day: number;
  last_digest_sent_at: string | null;
  /**
   * Whether this profile consented to LLM personalization. Carried on the
   * recipient so the job can decide *before* calling the recommender — the
   * point of the flag is that a non-consenting profile's titles and verdict
   * notes never leave for the provider at all.
   */
  ai_personalization_enabled: boolean;
};

export async function fetchProfile(db: ProfilesDb, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await db
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[profiles] fetch_failed:", error.message);
    return null;
  }

  return (data as ProfileRow | null) ?? null;
}

export async function fetchDigestPreferences(
  db: ProfilesDb,
  userId: string,
): Promise<DigestPreferences> {
  return toDigestPreferences(await fetchProfile(db, userId));
}

export type UpdateDigestPreferencesResult = {
  ok: boolean;
  preferences: DigestPreferences;
};

/**
 * Applies a validated preference patch to the caller's own row. `userId` is
 * always the session user id resolved by the route — never a client-supplied
 * value — and RLS re-checks it server-side.
 */
export async function updateDigestPreferences(
  db: ProfilesDb,
  userId: string,
  patch: DigestPreferencesPatch,
): Promise<UpdateDigestPreferencesResult> {
  const { data, error } = await db
    .from("profiles")
    .update(patch)
    .eq("user_id", userId)
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[profiles] update_failed:", error.message);
    return { ok: false, preferences: { ...DEFAULT_DIGEST_PREFERENCES, ...patch } };
  }

  if (!data) {
    // No row matched — the profile trigger has not run for this account yet.
    return { ok: false, preferences: { ...DEFAULT_DIGEST_PREFERENCES, ...patch } };
  }

  return { ok: true, preferences: toDigestPreferences(data as ProfileRow) };
}

/** Convenience wrapper for server components / routes acting on the session user. */
export async function getDigestPreferencesForUser(userId: string): Promise<DigestPreferences> {
  const supabase = await createClient();
  return fetchDigestPreferences(supabase, userId);
}

/** Convenience wrapper for routes acting on the session user. */
export async function setDigestPreferencesForUser(
  userId: string,
  patch: DigestPreferencesPatch,
): Promise<UpdateDigestPreferencesResult> {
  const supabase = await createClient();
  return updateDigestPreferences(supabase, userId, patch);
}

export type ListProfilesDueForDigestOptions = {
  now?: Date;
  limit?: number;
};

const DEFAULT_DIGEST_BATCH = 200;

/**
 * Admin-client path for the weekly job (W2): profiles enabled for today's
 * weekday that have not been mailed inside the minimum interval. The SQL
 * narrows the scan; `isDigestDue` re-checks each row so the cadence rule lives
 * in one place.
 *
 * Suppressed profiles are excluded here rather than at the send site: this is
 * the single chokepoint every letter passes through, so a bounced or
 * complained-about address cannot be reached by any future caller that forgets
 * to check (see `digest-suppression.ts` for why suppression is not folded into
 * `digest_enabled`).
 */
export async function listProfilesDueForDigest(
  admin: ProfilesDb,
  { now = new Date(), limit = DEFAULT_DIGEST_BATCH }: ListProfilesDueForDigestOptions = {},
): Promise<DigestRecipient[]> {
  const { data, error } = await admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("digest_enabled", true)
    .eq("digest_day", now.getUTCDay())
    .is("digest_suppressed_at", null)
    .not("email", "is", null)
    .or(`last_digest_sent_at.is.null,last_digest_sent_at.lt.${digestSentCutoff(now)}`)
    .order("last_digest_sent_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    console.error("[profiles] due_query_failed:", error.message);
    return [];
  }

  return ((data as ProfileRow[] | null) ?? [])
    .filter((profile) => isDigestDue(profile, now))
    .map((profile) => ({
      user_id: profile.user_id,
      email: profile.email as string,
      unsubscribe_token: profile.unsubscribe_token,
      digest_day: profile.digest_day,
      last_digest_sent_at: profile.last_digest_sent_at,
      // Same strict check as toDigestPreferences: anything other than a stored
      // `true` — including a row from before the consent migration — is "no".
      ai_personalization_enabled: profile.ai_personalization_enabled === true,
    }));
}

/** Records a successful send so the same profile is skipped for the rest of the week. */
export async function markDigestSent(
  admin: ProfilesDb,
  userId: string,
  sentAt: Date = new Date(),
): Promise<boolean> {
  const { error } = await admin
    .from("profiles")
    .update({ last_digest_sent_at: sentAt.toISOString() })
    .eq("user_id", userId);

  if (error) {
    console.error("[profiles] mark_sent_failed:", error.message);
    return false;
  }
  return true;
}

/**
 * One-click unsubscribe. Runs on the admin client because the link is followed
 * without a session; the unguessable token is the only credential.
 */
export async function disableDigestByUnsubscribeToken(
  admin: ProfilesDb,
  token: string,
): Promise<boolean> {
  if (!token.trim()) return false;

  const { data, error } = await admin
    .from("profiles")
    .update({ digest_enabled: false })
    .eq("unsubscribe_token", token)
    .select("user_id")
    .maybeSingle();

  if (error) {
    console.error("[profiles] unsubscribe_failed:", error.message);
    return false;
  }
  return Boolean(data);
}

/* ---------------------------------------------------------------------------
 * Deliverability (Resend webhooks)
 * ------------------------------------------------------------------------ */

/** Columns the webhook handler reads and writes. Never selected with `*`. */
const DELIVERABILITY_COLUMNS =
  "user_id, email, digest_suppressed_at, digest_suppression_reason, digest_soft_bounce_count";

type DeliverabilityRow = {
  user_id: string;
  email: string | null;
  digest_suppressed_at: string | null;
  digest_suppression_reason: string | null;
  digest_soft_bounce_count: number | null;
};

export type DeliverabilityOutcome =
  /** The address is now suppressed (or was upgraded to a stronger reason). */
  | "suppressed"
  /** A transient failure was counted, below the threshold. */
  | "counted"
  /** A delivery cleared an accumulated soft-bounce streak. */
  | "reset"
  /** Nothing to change — already suppressed, or the counter was already zero. */
  | "noop"
  /** No profile carries that address. */
  | "no_match"
  /** The read or write failed; the caller should let the provider retry. */
  | "failed";

/**
 * Escape the wildcards PostgREST hands to `ILIKE`. Underscores are legal in
 * email local parts and `_` is a single-character wildcard, so an unescaped
 * lookup for `a_b@x.com` would also match `axb@x.com`.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}

/**
 * Find the profile for an address, case-insensitively — addresses are treated
 * as case-insensitive in practice, and Resend echoes back whatever casing the
 * envelope carried.
 *
 * The `ilike` is only a *narrowing* filter; the exact, lowercased comparison
 * below is what decides. PostgREST also rewrites `*` in a `like`/`ilike`
 * pattern into `%`, which cannot be escaped away, so re-checking in TypeScript
 * is what guarantees a crafted address can never suppress somebody else's row.
 */
async function findProfileByEmail(
  admin: ProfilesDb,
  email: string,
): Promise<DeliverabilityRow | null | "failed"> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  const { data, error } = await admin
    .from("profiles")
    .select(DELIVERABILITY_COLUMNS)
    .ilike("email", escapeLikePattern(target))
    .limit(5);

  if (error) {
    console.error("[profiles] deliverability_lookup_failed:", error.message);
    return "failed";
  }

  const rows = (data as DeliverabilityRow[] | null) ?? [];
  return rows.find((row) => (row.email ?? "").trim().toLowerCase() === target) ?? null;
}

async function writeDeliverability(
  admin: ProfilesDb,
  userId: string,
  patch: Database["public"]["Tables"]["profiles"]["Update"],
): Promise<boolean> {
  const { error } = await admin.from("profiles").update(patch).eq("user_id", userId);
  if (error) {
    console.error("[profiles] deliverability_write_failed:", error.message);
    return false;
  }
  return true;
}

/**
 * Apply one verified Resend deliverability signal to the profile that owns the
 * address.
 *
 * Rules, in the order they matter:
 *
 *  - **Complaint suppresses immediately and always wins.** A spam report is the
 *    most damaging signal a sender can receive; it overwrites a weaker existing
 *    reason so the Settings copy tells the truth.
 *  - **Hard bounce suppresses immediately**, but never downgrades an existing
 *    complaint.
 *  - **Soft bounce counts**, and suppresses only at
 *    `SOFT_BOUNCE_SUPPRESSION_THRESHOLD`, so a mailbox that fills up and then
 *    clears does not permanently lose the letter.
 *  - **Delivered resets the counter** and nothing else. It deliberately does not
 *    lift a suppression: a hard bounce or a complaint is not undone by a later
 *    delivery to the same address.
 *
 * Caller-side de-duplication (`email_webhook_events`) is what makes the counting
 * branch exactly-once; everything else here is idempotent on its own.
 */
export async function applyDeliverabilitySignal(
  admin: ProfilesDb,
  {
    email,
    signal,
    now = new Date(),
  }: { email: string; signal: DeliverabilitySignal; now?: Date },
): Promise<DeliverabilityOutcome> {
  const profile = await findProfileByEmail(admin, email);
  if (profile === "failed") return "failed";
  if (!profile) return "no_match";

  const alreadySuppressed = Boolean(profile.digest_suppressed_at);
  const suppressedAt = now.toISOString();

  if (signal === "complaint") {
    // Always written, even when already suppressed: a complaint outranks any
    // bounce reason already stored.
    if (alreadySuppressed && profile.digest_suppression_reason === "complaint") return "noop";
    return (await writeDeliverability(admin, profile.user_id, {
      digest_suppressed_at: profile.digest_suppressed_at ?? suppressedAt,
      digest_suppression_reason: "complaint",
    }))
      ? "suppressed"
      : "failed";
  }

  if (signal === "hard_bounce") {
    if (alreadySuppressed) return "noop";
    return (await writeDeliverability(admin, profile.user_id, {
      digest_suppressed_at: suppressedAt,
      digest_suppression_reason: "hard_bounce",
    }))
      ? "suppressed"
      : "failed";
  }

  const count = Number.isFinite(profile.digest_soft_bounce_count)
    ? Number(profile.digest_soft_bounce_count)
    : 0;

  if (signal === "delivered") {
    if (count === 0) return "noop";
    return (await writeDeliverability(admin, profile.user_id, { digest_soft_bounce_count: 0 }))
      ? "reset"
      : "failed";
  }

  // signal === "soft_bounce"
  if (alreadySuppressed) return "noop";

  const next = count + 1;
  if (next < SOFT_BOUNCE_SUPPRESSION_THRESHOLD) {
    return (await writeDeliverability(admin, profile.user_id, { digest_soft_bounce_count: next }))
      ? "counted"
      : "failed";
  }

  return (await writeDeliverability(admin, profile.user_id, {
    digest_soft_bounce_count: next,
    digest_suppressed_at: suppressedAt,
    digest_suppression_reason: "repeated_soft_bounce",
  }))
    ? "suppressed"
    : "failed";
}

/** Admin client for the job-facing helpers above. */
export function createProfilesAdminClient(): ProfilesDb {
  return createAdminClient();
}

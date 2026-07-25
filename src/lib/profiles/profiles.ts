import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
  "user_id, email, digest_enabled, digest_day, ai_personalization_enabled, unsubscribe_token, last_digest_sent_at, created_at, updated_at";

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

/** Admin client for the job-facing helpers above. */
export function createProfilesAdminClient(): ProfilesDb {
  return createAdminClient();
}

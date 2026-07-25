/**
 * What goes into one person's weekly letter.
 *
 * Every query here is filtered on `user_id`. The job runs on the service-role
 * client (a cron has no session, hence no RLS identity), so the explicit filter
 * *is* the isolation boundary — the previous version of this job read `items`
 * with no owner filter at all and would have mailed one profile's shelves to
 * another. Nothing in this module may query without a `user_id` predicate.
 *
 * Reads fail soft: a broken query yields an empty section, and a letter with no
 * sections is never sent (see `hasDigestContent`). Silence beats a wrong or
 * empty nag.
 *
 * `verdict` and `note` are encrypted at rest (ADR 0013) and are deliberately
 * NOT selected: ADR 0002's open question flags that verdict text needs consent
 * before it leaves the profile, and an email is the least revocable place to
 * put it. Titles are not encrypted, so the letter is titles only.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, ItemCategory } from "@/lib/database.types";
import {
  mintRatingToken,
  RATING_LINK_TTL_SECONDS,
  RATING_STARS,
  ratingLinkUrl,
} from "@/lib/email/rating-link";

export type DigestDb = SupabaseClient<Database>;

/** "Still on your shelves" — the oldest things still marked `want`. */
export const DIGEST_FORGOTTEN_COUNT = 3;

/**
 * "Did you finish these?" — recently finished but unrated. Kept to two: each
 * one costs five links, and the whole point is a single easy tap.
 */
export const DIGEST_RATING_PROMPT_COUNT = 2;

export type DigestForgottenItem = {
  id: string;
  title: string | null;
  domain: string;
  category: ItemCategory | null;
  created_at: string;
};

export type DigestStarLink = { stars: number; url: string };

export type DigestRatingPrompt = {
  id: string;
  title: string | null;
  domain: string;
  category: ItemCategory | null;
  done_at: string | null;
  /** One signed one-tap link per star value (ADR 0002 / `rating-link.ts`). */
  starLinks: DigestStarLink[];
};

/** The one recommendation card, flattened out of `ResolvedRecommendation`. */
export type DigestRecommendation = {
  shelf_id: "books" | "watch";
  title: string;
  subtitle: string;
  description: string;
  reason: string;
  canonical_url: string;
  cover_url: string | null;
};

export type DigestLetterContent = {
  forgotten: DigestForgottenItem[];
  ratingPrompts: DigestRatingPrompt[];
};

export type DigestLetter = DigestLetterContent & {
  recommendation: DigestRecommendation | null;
  appUrl: string;
  unsubscribeUrl: string;
};

/** Public, session-less unsubscribe endpoint — the token is the only credential. */
export function unsubscribeUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/unsubscribe/${encodeURIComponent(token)}`;
}

async function fetchForgotten(db: DigestDb, userId: string): Promise<DigestForgottenItem[]> {
  const { data, error } = await db
    .from("items")
    .select("id, title, domain, category, created_at")
    .eq("user_id", userId)
    .eq("status", "want")
    .order("created_at", { ascending: true })
    .limit(DIGEST_FORGOTTEN_COUNT);

  if (error) {
    console.error("[digest] forgotten_query_failed:", error.message);
    return [];
  }
  return (data as DigestForgottenItem[] | null) ?? [];
}

type UnratedDoneRow = {
  id: string;
  title: string | null;
  domain: string;
  category: ItemCategory | null;
  done_at: string | null;
};

async function fetchUnratedDone(db: DigestDb, userId: string): Promise<UnratedDoneRow[]> {
  const { data, error } = await db
    .from("items")
    .select("id, title, domain, category, done_at")
    .eq("user_id", userId)
    .eq("status", "done")
    .is("rating_personal", null)
    .not("done_at", "is", null)
    .order("done_at", { ascending: false })
    .limit(DIGEST_RATING_PROMPT_COUNT);

  if (error) {
    console.error("[digest] unrated_query_failed:", error.message);
    return [];
  }
  return (data as UnratedDoneRow[] | null) ?? [];
}

/**
 * Mint the five star links for one item. Every link in a letter shares one
 * expiry so the row cannot drift apart, and a minting failure (no
 * `RATING_LINK_SECRET`) drops the whole section rather than sending dead links.
 */
function buildStarLinks(
  row: UnratedDoneRow,
  userId: string,
  appUrl: string,
  expiresAtSeconds: number,
): DigestStarLink[] {
  return RATING_STARS.map((stars) => ({
    stars,
    url: ratingLinkUrl(
      appUrl,
      mintRatingToken({ itemId: row.id, userId, stars, expiresAtSeconds }),
    ),
  }));
}

export type BuildDigestLetterContentOptions = {
  userId: string;
  appUrl: string;
  nowMs?: number;
};

/**
 * Load the per-user sections of the letter. Both queries are scoped to
 * `userId`; the rating links are signed for that same user id, so a mis-scoped
 * row could not produce a usable link even if one slipped through.
 */
export async function buildDigestLetterContent(
  db: DigestDb,
  { userId, appUrl, nowMs = Date.now() }: BuildDigestLetterContentOptions,
): Promise<DigestLetterContent> {
  const [forgotten, unrated] = await Promise.all([
    fetchForgotten(db, userId),
    fetchUnratedDone(db, userId),
  ]);

  let ratingPrompts: DigestRatingPrompt[] = [];
  try {
    // One expiry for the whole letter, so a row of stars never half-expires.
    const expiresAtSeconds = Math.floor(nowMs / 1000) + RATING_LINK_TTL_SECONDS;
    ratingPrompts = unrated.map((row) => ({
      ...row,
      starLinks: buildStarLinks(row, userId, appUrl, expiresAtSeconds),
    }));
  } catch (error) {
    console.error(
      "[digest] rating_links_unavailable:",
      error instanceof Error ? error.message : "unknown_error",
    );
    ratingPrompts = [];
  }

  return { forgotten, ratingPrompts };
}

/** A letter with no sections is not sent — an empty nag is worse than silence. */
export function hasDigestContent(letter: DigestLetter): boolean {
  return (
    letter.forgotten.length > 0 ||
    letter.ratingPrompts.length > 0 ||
    letter.recommendation !== null
  );
}

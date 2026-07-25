import { parseBearerToken } from "@/lib/auth/capture-token";
import { hasValidCronSecret } from "@/lib/auth/cron-secret";
import { digestSubject, renderDigestHtml } from "@/lib/email/digest-html";
import {
  buildDigestLetterContent,
  hasDigestContent,
  unsubscribeUrl,
  type DigestDb,
  type DigestLetter,
  type DigestRecommendation,
} from "@/lib/email/digest-letter";
import {
  createProfilesAdminClient,
  listProfilesDueForDigest,
  markDigestSent,
  type DigestRecipient,
} from "@/lib/profiles/profiles";
import { rateLimit } from "@/lib/rate-limit";
import { generateRecommendations } from "@/lib/recommend/generate";
import {
  RECOMMEND_MIN_ITEMS,
  RECOMMEND_WATCH_REGION,
  isShelfRecommendEnabled,
} from "@/lib/recommend/recommend-config";
import type { RecommendShelfId } from "@/lib/recommend/recommend-types";
import { MIN_DIGEST_INTERVAL_DAYS } from "@/lib/profiles/digest-preferences";

const LOG_PREFIX = "[api/jobs/digest]";

/**
 * Ceiling on recipients per run. Deliberately small: a cron that fans out is
 * the one mistake in this job that cannot be taken back, and there is no upside
 * to draining a week's worth of profiles in one invocation. Raise it
 * consciously once a real send has been reviewed with `?dry=1`.
 */
const DEFAULT_MAX_RECIPIENTS = 5;

/**
 * How many recipients per run may get a generated recommendation card.
 *
 * Defaults to 0 — off — for two independent reasons:
 *   1. Cost/fan-out: each card is an LLM call plus resolver fetches, and a cron
 *      must not be able to spend unboundedly.
 *   2. Consent: `generateRecommendations` builds its taste profile from verdict
 *      notes, which ADR 0002 lists as an open question — sending other people's
 *      notes to the Gateway needs disclosure or opt-in first. Keeping the
 *      default at 0 means shipping this job sends nobody's notes anywhere.
 */
const DEFAULT_RECOMMEND_MAX_USERS = 0;

/** Hard stop for one card, so a slow model cannot eat the whole cron budget. */
const DEFAULT_RECOMMEND_TIMEOUT_MS = 25_000;

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

type RecipientOutcome = {
  user_id: string;
  sent: boolean;
  reason?: "nothing_to_say" | "email_not_configured" | "send_failed" | "dry_run";
  /** Dry runs only — what would have gone out. */
  email?: string;
  subject?: string;
  sections?: { forgotten: number; rating_prompts: number; recommendation: boolean };
  html?: string;
};

/** Resolves to `null` if the work has not finished in `ms` — the caller fails open. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

/**
 * Which shelf (if any) this profile has enough of to be worth recommending
 * from. Scoped to `user_id` like everything else here; the count also spares an
 * LLM call for a library the pipeline would reject anyway.
 */
async function pickRecommendShelf(
  admin: DigestDb,
  userId: string,
): Promise<RecommendShelfId | null> {
  const { data, error } = await admin
    .from("items")
    .select("category")
    .eq("user_id", userId)
    .in("category", ["books", "movies_and_tv"]);

  if (error) {
    console.error(`${LOG_PREFIX} shelf_pick_failed:`, error.message);
    return null;
  }

  const rows = (data as Array<{ category: string | null }> | null) ?? [];
  const counts = { books: 0, watch: 0 };
  for (const row of rows) {
    if (row.category === "books") counts.books += 1;
    else if (row.category === "movies_and_tv") counts.watch += 1;
  }

  const candidates: RecommendShelfId[] = counts.watch > counts.books
    ? ["watch", "books"]
    : ["books", "watch"];

  return (
    candidates.find(
      (shelfId) => counts[shelfId] >= RECOMMEND_MIN_ITEMS && isShelfRecommendEnabled(shelfId),
    ) ?? null
  );
}

/**
 * One recommendation card, or `null`. Fails open on every path — a missing card
 * costs the letter one section; a thrown error would cost the whole send.
 *
 * The rate-limit bucket is deliberately its own (`digest:recommend:<uid>`), not
 * the interactive deck's `recommend:<uid>`: a weekly email must not be able to
 * eat the daily budget a signed-in user is entitled to.
 */
async function buildRecommendation(
  admin: DigestDb,
  userId: string,
): Promise<DigestRecommendation | null> {
  try {
    const shelfId = await pickRecommendShelf(admin, userId);
    if (!shelfId) return null;

    const rl = await rateLimit(
      `digest:recommend:${userId}`,
      1,
      MIN_DIGEST_INTERVAL_DAYS * 86_400,
    );
    if (!rl.ok) return null;

    const result = await withTimeout(
      generateRecommendations({
        userId,
        shelfId,
        supabase: admin,
        region: RECOMMEND_WATCH_REGION,
        count: 1,
        logPrefix: LOG_PREFIX,
      }),
      positiveIntEnv("DIGEST_RECOMMEND_TIMEOUT_MS", DEFAULT_RECOMMEND_TIMEOUT_MS),
    );

    // Timed out, pipeline error, or a legitimately empty run (ADR 0016) — all
    // of them just mean "no card this week".
    if (!result || !result.ok || result.cards.length === 0) return null;

    const card = result.cards[0];
    return {
      shelf_id: shelfId,
      title: card.title,
      subtitle: card.subtitle,
      description: card.description,
      reason: card.reason,
      canonical_url: card.canonical_url,
      cover_url: card.cover_url,
    };
  } catch (error) {
    console.error(
      `${LOG_PREFIX} recommend_failed:`,
      error instanceof Error ? error.message : "unknown_error",
    );
    return null;
  }
}

async function sendLetter(
  recipient: DigestRecipient,
  letter: DigestLetter,
  html: string,
): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.DIGEST_EMAIL_FROM ?? "theque <digest@theque.app>",
      to: [recipient.email],
      subject: digestSubject(letter),
      html,
      // RFC 8058 one-click: the POST endpoint unsubscribes with no confirmation
      // step, which is what mailbox providers require before they show their own
      // unsubscribe button instead of a spam report.
      headers: {
        "List-Unsubscribe": `<${letter.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (!res.ok) {
    console.error(`${LOG_PREFIX} send_failed:`, res.status);
    return false;
  }
  return true;
}

/**
 * GET/POST /api/jobs/digest (cron) — the weekly letter, one per profile.
 *
 * Cadence lives here, not in the cron expression: Vercel fires this daily and
 * the job selects the profiles whose `last_digest_sent_at` is older than
 * `MIN_DIGEST_INTERVAL_DAYS` on their chosen weekday. That survives a missed
 * run, a retried run, and a double fire — `markDigestSent` closes the window
 * the moment a send succeeds.
 *
 * `?dry=1` renders everything and returns it without touching Resend and
 * without stamping `last_digest_sent_at`. It is the intended way to review the
 * letter before any real send. Recommendation cards are skipped in a dry run
 * (generating one writes `shown` outcome rows and spends LLM budget); add
 * `&recommend=1` to opt into that side effect for a full preview.
 */
async function handleDigestJob(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = parseBearerToken(req.headers.get("authorization"));
  if (!hasValidCronSecret(bearer, secret)) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const dry = params.get("dry") === "1";
  const previewRecommendations = dry && params.get("recommend") === "1";

  const maxRecipients = positiveIntEnv("DIGEST_MAX_RECIPIENTS", DEFAULT_MAX_RECIPIENTS);
  if (maxRecipients === 0) {
    return Response.json({ dry, due: 0, sent: 0, recipients: [], reason: "recipient_cap_zero" });
  }

  let admin: DigestDb;
  try {
    admin = createProfilesAdminClient();
  } catch (error) {
    console.error(`${LOG_PREFIX} admin_client_unavailable:`, (error as Error).message);
    return Response.json({ code: "server_misconfigured" }, { status: 500 });
  }

  const now = new Date();
  const recipients = await listProfilesDueForDigest(admin, { now, limit: maxRecipients });
  if (recipients.length === 0) {
    return Response.json({ dry, due: 0, sent: 0, recipients: [] });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://theque.app";
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);
  const recommendBudget = positiveIntEnv(
    "DIGEST_RECOMMEND_MAX_USERS",
    DEFAULT_RECOMMEND_MAX_USERS,
  );

  let recommendationsUsed = 0;
  let sent = 0;
  const outcomes: RecipientOutcome[] = [];

  // Sequential on purpose: a handful of profiles per run, and one slow LLM call
  // or provider hiccup should not multiply into concurrent load.
  for (const recipient of recipients) {
    const content = await buildDigestLetterContent(admin, {
      userId: recipient.user_id,
      appUrl,
      nowMs: now.getTime(),
    });

    let recommendation: DigestRecommendation | null = null;
    if (recommendationsUsed < recommendBudget && (!dry || previewRecommendations)) {
      recommendation = await buildRecommendation(admin, recipient.user_id);
      if (recommendation) recommendationsUsed += 1;
    }

    const letter: DigestLetter = {
      ...content,
      recommendation,
      appUrl,
      unsubscribeUrl: unsubscribeUrl(appUrl, recipient.unsubscribe_token),
    };

    if (!hasDigestContent(letter)) {
      outcomes.push({ user_id: recipient.user_id, sent: false, reason: "nothing_to_say" });
      continue;
    }

    const html = renderDigestHtml(letter);

    if (dry) {
      outcomes.push({
        user_id: recipient.user_id,
        sent: false,
        reason: "dry_run",
        email: recipient.email,
        subject: digestSubject(letter),
        sections: {
          forgotten: letter.forgotten.length,
          rating_prompts: letter.ratingPrompts.length,
          recommendation: recommendation !== null,
        },
        html,
      });
      continue;
    }

    if (!emailConfigured) {
      outcomes.push({ user_id: recipient.user_id, sent: false, reason: "email_not_configured" });
      continue;
    }

    if (!(await sendLetter(recipient, letter, html))) {
      outcomes.push({ user_id: recipient.user_id, sent: false, reason: "send_failed" });
      continue;
    }

    // Stamped only after a confirmed send, so a double cron fire cannot
    // double-send and a failed send is retried on the next run.
    await markDigestSent(admin, recipient.user_id, now);
    sent += 1;
    outcomes.push({ user_id: recipient.user_id, sent: true });
  }

  return Response.json({ dry, due: recipients.length, sent, recipients: outcomes });
}

export async function GET(req: Request) {
  return handleDigestJob(req);
}

export async function POST(req: Request) {
  return handleDigestJob(req);
}

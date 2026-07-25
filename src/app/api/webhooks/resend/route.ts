/**
 * POST /api/webhooks/resend — bounce and complaint handling for the weekly letter.
 *
 * Nothing consumed Resend's events before this, so a hard-bouncing address was
 * mailed again every cycle forever and a spam complaint changed nothing. On a
 * young `theque.app` domain with `p=quarantine` DMARC, reputation is shared
 * across every profile: one dead address kept in the send list degrades
 * delivery for everyone else.
 *
 * This endpoint is **unauthenticated and publicly reachable** — it has to be,
 * Resend has no session — so the Svix signature is the entire trust boundary:
 *
 *   1. Read the body **once, as raw text**. Verifying a re-serialized object
 *      cannot work: `JSON.parse` → `JSON.stringify` does not round-trip
 *      byte-identically, so every signature would fail.
 *   2. Verify signature and timestamp *before* parsing or acting on anything.
 *      Missing secret, missing/malformed headers, bad signature or a stale
 *      timestamp all fail closed with 401.
 *   3. Claim the `svix-id` so a retry cannot count the same soft bounce twice.
 *   4. Only then parse the JSON and apply the signal.
 *
 * Everything past step 2 answers **2xx**, including events we do not handle and
 * addresses we do not recognize. A non-2xx makes Svix retry for hours, and a
 * response that distinguished "known address" from "unknown address" would turn
 * a signed webhook into an account-enumeration oracle for anyone who obtained
 * the signing secret.
 *
 * The endpoint is not matched by `src/middleware.ts` (its matcher lists app
 * routes, not `/api/*`), and `src/app/robots.ts` already disallows `/api/`.
 */
import {
  parseResendEvent,
  verifyResendWebhook,
  type ResendWebhookFailureReason,
} from "@/lib/email/resend-webhook";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/email/webhook-events";
import { applyDeliverabilitySignal, createProfilesAdminClient } from "@/lib/profiles/profiles";

const LOG_PREFIX = "[api/webhooks/resend]";

// Writes on every call; must never be cached or prerendered.
export const dynamic = "force-dynamic";

/**
 * One flat 401 for every verification failure. The reason is logged, never
 * returned: an unauthenticated caller learns only "no", not whether the secret
 * is unset, the timestamp stale, or the signature merely wrong.
 */
function unauthorized(reason: ResendWebhookFailureReason) {
  console.warn(`${LOG_PREFIX} rejected:`, reason);
  return Response.json({ code: "unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  // Raw body first, and only once — Request bodies are single-use, and the
  // signature is over these exact bytes.
  let payload: string;
  try {
    payload = await req.text();
  } catch {
    return Response.json({ code: "invalid_body" }, { status: 400 });
  }

  const verification = verifyResendWebhook({
    payload,
    headers: {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    secret: process.env.RESEND_WEBHOOK_SECRET,
  });

  if (!verification.ok) return unauthorized(verification.reason);

  let body: unknown;
  try {
    body = JSON.parse(payload);
  } catch {
    // Signed by us but not JSON: nothing to retry into, so acknowledge it.
    console.error(`${LOG_PREFIX} unparseable_payload`);
    return Response.json({ received: true, handled: false });
  }

  const event = parseResendEvent(body);
  if (!event.handled) {
    // Opens, clicks, delivery delays, contact and domain events. Acknowledged
    // without a claim so the de-dupe table only ever holds events we acted on.
    return Response.json({ received: true, handled: false });
  }

  let admin;
  try {
    admin = createProfilesAdminClient();
  } catch (error) {
    console.error(`${LOG_PREFIX} admin_client_unavailable:`, (error as Error).message);
    // A real, retryable outage on our side — let Svix bring it back.
    return Response.json({ code: "server_misconfigured" }, { status: 500 });
  }

  const claim = await claimWebhookEvent(admin, verification.id, event.type);
  if (claim === "duplicate") {
    return Response.json({ received: true, handled: true, duplicate: true });
  }
  if (claim === "failed") {
    return Response.json({ code: "claim_failed" }, { status: 500 });
  }

  const outcomes: string[] = [];
  for (const email of event.recipients) {
    outcomes.push(await applyDeliverabilitySignal(admin, { email, signal: event.signal }));
  }

  if (outcomes.includes("failed")) {
    // Hand the claim back so the retry can redo the work instead of being
    // swallowed by our own de-duplication.
    await releaseWebhookEvent(admin, verification.id);
    return Response.json({ code: "apply_failed" }, { status: 500 });
  }

  // Deliberately uniform: the response never says whether an address matched a
  // profile. The log does.
  console.info(`${LOG_PREFIX} ${event.type} ${event.signal}: ${outcomes.join(",")}`);
  return Response.json({ received: true, handled: true });
}

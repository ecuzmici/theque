/**
 * Resend webhook verification and event parsing.
 *
 * Resend signs webhooks with **Svix** (the Standard Webhooks scheme). The
 * endpoint is unauthenticated and publicly reachable, so the signature is the
 * only thing standing between a stranger and the ability to suppress every
 * profile's weekly letter. Verification therefore fails closed on every path.
 *
 * Wire format:
 *
 *   svix-id         message id, stable across retries (the de-dupe key)
 *   svix-timestamp  unix seconds, *re-issued on every delivery attempt*
 *   svix-signature  space-delimited list of "v1,<base64 HMAC>" entries
 *
 * The signed content is `"<svix-id>.<svix-timestamp>.<raw body>"`, HMAC-SHA256
 * with the base64-decoded portion of the `whsec_…` secret as the key, encoded
 * base64. The header holds a *list* because Svix serves both keys during a
 * rotation — any entry matching is a pass.
 *
 * Two things are easy to get wrong and are load-bearing here:
 *
 *  - **The raw body must be signed, not a re-serialized object.** `JSON.parse`
 *    followed by `JSON.stringify` does not round-trip byte-identically (key
 *    order, whitespace, number formatting, unicode escapes), so every signature
 *    would fail. The route reads `req.text()` once, verifies, and only then
 *    parses.
 *  - **De-duplication and replay protection are different mechanisms.** Svix
 *    retries carry the *same* `svix-id` with a *fresh* `svix-timestamp` — if
 *    the timestamp were frozen at the original send, no retry could ever pass a
 *    ±5 minute tolerance. So the timestamp bounds replay of a captured request,
 *    and the id (claimed in `email_webhook_events`) bounds double-processing.
 *
 * Implemented by hand rather than by adding the `svix` package: it is a few
 * lines of `node:crypto`, the repo already hand-rolls HMAC link signing in
 * `src/lib/email/rating-link.ts` and already talks to Resend over plain `fetch`
 * rather than through its SDK, and a dependency that runs inside the trust
 * boundary of an unauthenticated public endpoint is worth avoiding when the
 * alternative is thirty auditable lines.
 */
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET_PREFIX = "whsec_";
const SIGNATURE_VERSION = "v1";
const HMAC_ALGORITHM = "sha256";

/** Svix's own convention, and what the Standard Webhooks spec recommends. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Cheap ceiling on a hostile `svix-signature` header. A rotation exposes two
 * keys, never dozens; without a bound, a megabyte of `v1,…` entries would buy
 * an attacker an unbounded number of HMAC computations per request.
 */
const MAX_SIGNATURES = 8;

/** Guards against a pathological body being HMAC'd. Real events are ~1 KB. */
const MAX_PAYLOAD_BYTES = 1_048_576;

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const DIGITS_PATTERN = /^\d+$/;

export type ResendWebhookHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export type ResendWebhookFailureReason =
  | "missing_secret"
  | "malformed_secret"
  | "missing_headers"
  | "malformed_id"
  | "malformed_timestamp"
  | "stale_timestamp"
  | "payload_too_large"
  | "bad_signature";

export type ResendWebhookVerification =
  | { ok: true; id: string }
  | { ok: false; reason: ResendWebhookFailureReason };

/**
 * The signing key: the base64 payload *after* the `whsec_` prefix, decoded to
 * bytes. Svix libraries accept the secret with or without the prefix, so we do
 * too. Returns `null` for anything that is not decodable base64 — a
 * misconfigured secret must fail closed, not silently key the HMAC on garbage.
 */
function signingKey(secret: string): Buffer | null {
  const raw = secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret;
  if (!raw || !BASE64_PATTERN.test(raw)) return null;
  const key = Buffer.from(raw, "base64");
  return key.length > 0 ? key : null;
}

/**
 * Constant-time comparison of two base64 signatures. `timingSafeEqual` throws
 * on a length mismatch, so the length check comes first — the same idiom as
 * `src/lib/auth/cron-secret.ts` and `src/lib/email/rating-link.ts`.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

/**
 * The `v1` signatures carried by the header, in order. Entries for other
 * versions are dropped rather than trusted, so a future/unknown scheme can
 * never be accepted by this verifier.
 */
function candidateSignatures(header: string): string[] {
  const found: string[] = [];
  for (const entry of header.split(/\s+/)) {
    if (!entry) continue;
    const separator = entry.indexOf(",");
    if (separator < 0) continue;
    if (entry.slice(0, separator) !== SIGNATURE_VERSION) continue;
    const signature = entry.slice(separator + 1);
    if (signature) found.push(signature);
    if (found.length >= MAX_SIGNATURES) break;
  }
  return found;
}

/**
 * Verify a Svix-signed Resend webhook against the raw request body.
 *
 * Fails closed on a missing or unparseable secret, missing or malformed
 * headers, a timestamp outside the tolerance, and of course a bad signature.
 * On success the caller gets the message id back, which is the de-dupe key.
 */
export function verifyResendWebhook({
  payload,
  headers,
  secret,
  nowMs = Date.now(),
}: {
  payload: string;
  headers: ResendWebhookHeaders;
  secret: string | undefined;
  nowMs?: number;
}): ResendWebhookVerification {
  if (!secret) return { ok: false, reason: "missing_secret" };

  const key = signingKey(secret);
  if (!key) return { ok: false, reason: "malformed_secret" };

  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" };

  if (Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD_BYTES) {
    return { ok: false, reason: "payload_too_large" };
  }

  // An id containing "." would let a crafted id/timestamp pair produce the same
  // signed string as a different pair; ids are opaque tokens, so reject early.
  if (id.includes(".")) return { ok: false, reason: "malformed_id" };

  if (!DIGITS_PATTERN.test(timestamp)) return { ok: false, reason: "malformed_timestamp" };

  const sentAtSeconds = Number(timestamp);
  if (!Number.isSafeInteger(sentAtSeconds)) {
    return { ok: false, reason: "malformed_timestamp" };
  }
  // Both directions: a captured request replayed later, and a clock-skewed or
  // forged future timestamp, are equally unwelcome.
  if (Math.abs(nowMs / 1000 - sentAtSeconds) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected = createHmac(HMAC_ALGORITHM, key)
    .update(`${id}.${timestamp}.${payload}`, "utf8")
    .digest("base64");

  const candidates = candidateSignatures(signature);
  // `some` short-circuits, which leaks only *which position* matched — not any
  // byte of the secret. Each individual comparison is constant-time.
  if (!candidates.some((candidate) => constantTimeEquals(expected, candidate))) {
    return { ok: false, reason: "bad_signature" };
  }

  return { ok: true, id };
}

/* ---------------------------------------------------------------------------
 * Event parsing
 * ------------------------------------------------------------------------ */

/** What an event means for deliverability, once stripped of Resend's wire shape. */
export type DeliverabilitySignal = "hard_bounce" | "soft_bounce" | "complaint" | "delivered";

export type ParsedResendEvent =
  | { handled: true; type: string; signal: DeliverabilitySignal; recipients: string[] }
  | { handled: false; type: string | null };

/**
 * Hard vs. soft, defaulting to **hard**.
 *
 * Resend's bounce object carries `type` ∈ {Permanent, Transient, Undetermined}
 * (SES-derived) plus a finer `subType`, but the field has moved around between
 * shapes — older material shows a flat `bounce_type: "hard" | "soft"` — so both
 * are read and anything unrecognized falls through to hard.
 *
 * Leaning hard is deliberate, and the asymmetry of harm is the whole argument:
 *
 *  - Over-suppressing costs one person a weekly newsletter, and they can see
 *    exactly why in Settings. It is visible and recoverable.
 *  - Under-suppressing keeps mailing an address that rejects us, on a young
 *    `theque.app` domain with `p=quarantine`. Reputation is shared across every
 *    profile, and it is not recoverable on any human timescale.
 *
 * It also matches the provider's own semantics: Resend emits `email.bounced`
 * for permanent rejection and routes transient trouble to
 * `email.delivery_delayed`, retrying internally — a bounce we cannot classify
 * has, by Resend's definition, most likely already exhausted those retries.
 * Only an explicit `Transient` / `soft` gets the gentler counted path.
 */
export function classifyBounce(data: Record<string, unknown>): "hard_bounce" | "soft_bounce" {
  const bounce = data.bounce;
  const nested =
    typeof bounce === "object" && bounce !== null
      ? (bounce as Record<string, unknown>).type
      : undefined;
  const flat = data.bounce_type;
  const raw = typeof nested === "string" ? nested : typeof flat === "string" ? flat : "";

  const normalized = raw.trim().toLowerCase();
  return normalized === "transient" || normalized === "soft" ? "soft_bounce" : "hard_bounce";
}

/**
 * Recipients, normalized for matching: lowercased, trimmed, de-duplicated.
 *
 * `data.to` is an array in Resend's own schema; `data.email` shows up as a bare
 * string in some of their examples. Both are accepted, neither is required.
 */
function extractRecipients(data: Record<string, unknown>): string[] {
  const raw: unknown[] = Array.isArray(data.to)
    ? data.to
    : typeof data.to === "string"
      ? [data.to]
      : typeof data.email === "string"
        ? [data.email]
        : [];

  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().toLowerCase();
    if (normalized) seen.add(normalized);
  }
  return [...seen];
}

/**
 * Turn a verified webhook body into a deliverability signal, or report it as
 * unhandled. Unhandled is not an error: `email.sent`, `email.opened`,
 * `email.delivery_delayed`, contact and domain events all land here and the
 * route answers 2xx, because a non-2xx would have Svix retrying forever.
 *
 * `email.delivery_delayed` is deliberately *not* counted as a soft bounce:
 * Resend retries those itself and emits `email.bounced` if they ultimately
 * fail, so counting both would double-count the same failure.
 */
export function parseResendEvent(body: unknown): ParsedResendEvent {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { handled: false, type: null };
  }

  const event = body as Record<string, unknown>;
  const type = typeof event.type === "string" ? event.type : null;
  if (!type) return { handled: false, type: null };

  const data =
    typeof event.data === "object" && event.data !== null && !Array.isArray(event.data)
      ? (event.data as Record<string, unknown>)
      : null;
  if (!data) return { handled: false, type };

  let signal: DeliverabilitySignal;
  switch (type) {
    case "email.bounced":
      signal = classifyBounce(data);
      break;
    case "email.complained":
      signal = "complaint";
      break;
    case "email.delivered":
      signal = "delivered";
      break;
    default:
      return { handled: false, type };
  }

  const recipients = extractRecipients(data);
  if (recipients.length === 0) return { handled: false, type };

  return { handled: true, type, signal, recipients };
}

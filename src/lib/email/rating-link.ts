/**
 * Signed, stateless rating links for the weekly email.
 *
 * The verdict loop is thèque's moat (ADR 0002), but it only closes when a user
 * comes back and does unrewarded data entry. The weekly email asks "did you
 * finish X?" with five star links; tapping one writes the rating with no login
 * and no round trip to a session. That means the link itself is the credential,
 * so it is HMAC-signed over the *whole* payload and verified fail-closed.
 *
 * Wire format (URL-safe, so it can live in a path segment):
 *
 *   rl.v1.<payload>.<signature>
 *
 * `<payload>` is base64url of `"<itemId>:<userId>:<stars>:<expiresAtSeconds>"`,
 * and `<signature>` is base64url HMAC-SHA256 over the literal string
 * `"rl.v1.<payload>"` — the version prefix is inside the signed input, so a
 * token cannot be downgraded to a future/looser version either. Because every
 * field is signed together, no item id, user id, or star value can be swapped
 * without invalidating the signature. The `rl.v1` prefix mirrors the `enc.v1`
 * convention in `src/lib/crypto/field-crypto.ts` and leaves room for rotation.
 *
 * Key handling: `RATING_LINK_SECRET` is resolved lazily on every call, never
 * cached at import time, so tests (and a late-bound Vercel env) behave. A
 * missing secret makes minting throw and verification fail — links are never
 * accepted unsigned.
 */
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "rl.v1";
const FIELD_SEPARATOR = ":";
const HMAC_ALGORITHM = "sha256";

/** The only ratings `items.rating_personal` accepts (mirrors the PATCH route). */
export const RATING_STARS = [1, 2, 3, 4, 5] as const;

/**
 * 30 days. The email that carries these links goes out weekly, and inboxes are
 * read late — a window of roughly four sending cycles catches the long tail of
 * "I archived it, then came back to it" without keeping a forwarded email or a
 * mail-server log alive as a write handle to someone's library forever.
 */
export const RATING_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Cheap upper bound so a pathological path segment is rejected before any HMAC work. */
const MAX_TOKEN_LENGTH = 512;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS_PATTERN = /^\d+$/;

export type RatingLinkPayload = {
  itemId: string;
  userId: string;
  stars: number;
  /** Unix seconds; carried through to sibling links so a correction can't extend the window. */
  expiresAtSeconds: number;
};

export type RatingLinkFailureReason =
  | "missing_secret"
  | "malformed"
  | "bad_signature"
  | "expired"
  | "invalid_stars";

export type RatingLinkVerification =
  | { ok: true; payload: RatingLinkPayload }
  | { ok: false; reason: RatingLinkFailureReason };

function getSecret(): string | null {
  const raw = process.env.RATING_LINK_SECRET;
  return raw ? raw : null;
}

function sign(signingInput: string, secret: string): string {
  return createHmac(HMAC_ALGORITHM, secret).update(signingInput, "utf8").digest("base64url");
}

/**
 * Constant-time string comparison. `timingSafeEqual` throws on a length
 * mismatch, so the length check comes first (same idiom as
 * `src/lib/auth/cron-secret.ts`). Signatures are compared in their canonical
 * base64url form, which also rejects non-canonical re-encodings of a valid MAC.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

function isValidStars(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

/**
 * Mint a rating link token. Throws on misconfiguration or bad input — a caller
 * building an email should fail loudly rather than send a dead link.
 *
 * `expiresAtSeconds` is explicit when re-minting the sibling star values shown
 * on the confirmation page: the corrections inherit the original expiry instead
 * of silently sliding the window forward on every tap.
 */
export function mintRatingToken({
  itemId,
  userId,
  stars,
  expiresAtSeconds,
  nowMs = Date.now(),
}: {
  itemId: string;
  userId: string;
  stars: number;
  expiresAtSeconds?: number;
  nowMs?: number;
}): string {
  const secret = getSecret();
  if (!secret) {
    throw new Error(
      "RATING_LINK_SECRET is not set. Rating links are HMAC-signed (see .env.local.example) — " +
        "refusing to mint an unsigned link.",
    );
  }
  if (!UUID_PATTERN.test(itemId)) {
    throw new Error("mintRatingToken: itemId must be a UUID.");
  }
  if (!UUID_PATTERN.test(userId)) {
    throw new Error("mintRatingToken: userId must be a UUID.");
  }
  if (!isValidStars(stars)) {
    throw new Error(`mintRatingToken: stars must be an integer 1-5, got ${stars}.`);
  }

  const expiry = expiresAtSeconds ?? Math.floor(nowMs / 1000) + RATING_LINK_TTL_SECONDS;
  if (!Number.isSafeInteger(expiry) || expiry <= 0) {
    throw new Error("mintRatingToken: expiresAtSeconds must be a positive integer (unix seconds).");
  }

  const payload = [itemId, userId, String(stars), String(expiry)].join(FIELD_SEPARATOR);
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const signingInput = `${TOKEN_PREFIX}.${encoded}`;
  return `${signingInput}.${sign(signingInput, secret)}`;
}

/**
 * Verify a rating link token. Fails closed on every path: missing secret,
 * malformed shape, bad signature, expired, or an out-of-range star value.
 *
 * The signature is checked *before* the payload is decoded, so untrusted bytes
 * are never parsed into fields we then act on.
 */
export function verifyRatingToken(
  token: string | null | undefined,
  nowMs: number = Date.now(),
): RatingLinkVerification {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: "missing_secret" };

  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "malformed" };
  }

  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };

  const [prefix, version, encoded, signature] = parts;
  if (`${prefix}.${version}` !== TOKEN_PREFIX) return { ok: false, reason: "malformed" };
  if (!BASE64URL_PATTERN.test(encoded) || !BASE64URL_PATTERN.test(signature)) {
    return { ok: false, reason: "malformed" };
  }

  const signingInput = `${TOKEN_PREFIX}.${encoded}`;
  if (!constantTimeEquals(sign(signingInput, secret), signature)) {
    return { ok: false, reason: "bad_signature" };
  }

  const fields = Buffer.from(encoded, "base64url").toString("utf8").split(FIELD_SEPARATOR);
  if (fields.length !== 4) return { ok: false, reason: "malformed" };

  const [itemId, userId, starsRaw, expiryRaw] = fields;
  if (!UUID_PATTERN.test(itemId) || !UUID_PATTERN.test(userId)) {
    return { ok: false, reason: "malformed" };
  }
  if (!DIGITS_PATTERN.test(expiryRaw)) return { ok: false, reason: "malformed" };

  const expiresAtSeconds = Number(expiryRaw);
  if (!Number.isSafeInteger(expiresAtSeconds)) return { ok: false, reason: "malformed" };

  // Star range is re-checked here (not only at mint) so a token signed by an
  // older or buggy minter can never write an out-of-range rating.
  const stars = Number(starsRaw);
  if (!DIGITS_PATTERN.test(starsRaw) || !isValidStars(stars)) {
    return { ok: false, reason: "invalid_stars" };
  }

  if (expiresAtSeconds * 1000 <= nowMs) return { ok: false, reason: "expired" };

  return { ok: true, payload: { itemId, userId, stars, expiresAtSeconds } };
}

/** Absolute URL for a rating link, for the weekly email's star row. */
export function ratingLinkUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/rate/${token}`;
}

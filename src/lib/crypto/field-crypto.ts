/**
 * Server-only field-level encryption for user-authored free text.
 *
 * Scope: exactly `items.note` and `items.verdict` (see ADR 0013). AES-256-GCM
 * via `node:crypto`, guarded with `import "server-only"` so the key and the
 * cipher never reach a client bundle.
 *
 * Wire format (stored in the same text column, no schema change):
 *
 *   enc.v1.<iv>.<ciphertext>.<tag>
 *
 * All three payload segments are base64url. The `v1` prefix reserves room
 * for key rotation later (`enc.v2.` tried against a newer key) without
 * needing to re-encrypt every row at once.
 *
 * Dual-read is the no-breakage guarantee: `decryptField` passes `null`/`""`
 * and any value without the `enc.` prefix straight through (pre-existing
 * plaintext rows from before this feature keep rendering). A well-formed
 * `enc.v1.*` value decrypts. A malformed or undecryptable `enc.*` value
 * (wrong segment count, bad base64url, tampered ciphertext/tag, unknown
 * version) throws — ciphertext must never be rendered as if it were content.
 *
 * Key handling: `FIELD_ENCRYPTION_KEY` (base64, decodes to exactly 32 bytes)
 * is resolved lazily on every call, never cached at module-import time, so
 * tests can set/unset `process.env.FIELD_ENCRYPTION_KEY` before invoking. A
 * missing or invalid key throws on use — never a silent plaintext fallback.
 */
import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION_TAG = "enc.v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;

// enc.v1.<iv>.<ciphertext>.<tag>, each payload segment base64url (RFC 4648 §5:
// letters, digits, '-', '_', no padding). Ciphertext may be zero-length (an
// encrypted empty string), so it alone allows an empty match.
const ENC_V1_PATTERN = /^enc\.v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]*)\.([A-Za-z0-9_-]+)$/;

function getKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY is not set. Field encryption requires a base64, 32-byte key " +
        "(see .env.local.example) — refusing to fall back to plaintext.",
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("FIELD_ENCRYPTION_KEY is not valid base64.");
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}.`,
    );
  }
  return key;
}

/**
 * Encrypt a plaintext string into the `enc.v1.<iv>.<ciphertext>.<tag>` wire
 * format. Throws if `FIELD_ENCRYPTION_KEY` is missing or invalid.
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION_TAG,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt a stored field value, dual-reading legacy plaintext.
 *
 * - `null` / `""` pass through unchanged.
 * - A value without the `enc.` prefix passes through unchanged (legacy
 *   plaintext written before field encryption shipped).
 * - A well-formed `enc.v1.*` value decrypts and returns plaintext.
 * - A malformed or undecryptable `enc.*` value throws.
 */
export function decryptField(value: string | null): string | null {
  if (value === null || value === "") return value;
  if (!value.startsWith("enc.")) return value;

  const match = ENC_V1_PATTERN.exec(value);
  if (!match) {
    throw new Error("Malformed encrypted field value: unrecognized enc.* format.");
  }
  const [, ivPart, ciphertextPart, tagPart] = match;

  const key = getKey();
  const iv = Buffer.from(ivPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  // decipher.final() throws on GCM auth-tag mismatch (tampered/corrupt data).
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Decrypt the `note` and `verdict` fields of an item row, if present. Every
 * other field is passed through untouched. Safe when `note`/`verdict` are
 * null or absent from the row shape (e.g. a narrower select).
 */
export function decryptItemFields<T extends { note?: string | null; verdict?: string | null }>(
  row: T,
): T {
  const copy: T = { ...row };
  if ("note" in copy) {
    copy.note = decryptField(copy.note ?? null) as T["note"];
  }
  if ("verdict" in copy) {
    copy.verdict = decryptField(copy.verdict ?? null) as T["verdict"];
  }
  return copy;
}

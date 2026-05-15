import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

export function hashCaptureTokenPlaintext(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function mintCaptureTokenParts(): {
  token: string;
  token_hash: string;
  token_prefix: string;
} {
  const secret = randomBytes(24).toString("base64url");
  const token = `bmly_${secret}`;
  return {
    token,
    token_hash: hashCaptureTokenPlaintext(token),
    token_prefix: token.slice(0, 8),
  };
}

export async function lookupCaptureTokenUser(
  tokenPlaintext: string,
): Promise<{ userId: string; tokenRowId: string } | null> {
  const trimmed = tokenPlaintext.trim();
  if (!trimmed.startsWith("bmly_")) return null;

  const admin = createAdminClient();
  const hash = hashCaptureTokenPlaintext(trimmed);
  const { data, error } = await admin
    .from("capture_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (error || !data || data.revoked_at) return null;

  await admin
    .from("capture_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { userId: data.user_id, tokenRowId: data.id };
}

export function parseBearerToken(headerValue: string | null): string | null {
  if (!headerValue?.startsWith("Bearer ")) return null;
  return headerValue.slice("Bearer ".length).trim();
}

import "server-only";

import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };

/**
 * Signed-in user from the session JWT. `getClaims` checks the signature
 * locally against the cached JWKS (the project signs with ES256), so the
 * request does not wait for an Auth server round trip. A signed-out JWT stays
 * valid until it expires (one hour at most).
 */
export async function getSessionUserOrNull(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  return { id: sub, email: typeof data.claims.email === "string" ? data.claims.email : null };
}

/**
 * Signed-in user checked against the Auth server. Use it before a write that
 * a stolen or signed-out JWT must not do, for example account deletion or a
 * new long-lived capture token.
 */
export async function getVerifiedSessionUserOrNull(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { id: user.id, email: user.email ?? null };
}

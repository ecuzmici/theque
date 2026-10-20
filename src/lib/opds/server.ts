import "server-only";

import { lookupCaptureTokenUser } from "@/lib/auth/capture-token";
import { OPDS_BOOK_COLUMNS, type OpdsBookRow, parseBasicAuthPassword } from "@/lib/opds/feed";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/** The catalog is personal. No cache may keep a copy. */
export const OPDS_CACHE_CONTROL = "private, no-store";

/** One catalog page view sends a few requests, plus one per cover. */
const FEED_LIMIT = 240;
const FEED_WINDOW_SEC = 600;

function unauthorized(): Response {
  return new Response("Unauthorized\n", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="theque"',
      "Cache-Control": OPDS_CACHE_CONTROL,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export function opdsText(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(`${body}\n`, {
    status,
    headers: { "Cache-Control": OPDS_CACHE_CONTROL, "Content-Type": "text/plain; charset=utf-8", ...headers },
  });
}

export function opdsXml(xml: string, type: string): Response {
  return new Response(xml, {
    headers: { "Content-Type": `${type};charset=utf-8`, "Cache-Control": OPDS_CACHE_CONTROL },
  });
}

/**
 * Check the HTTP Basic password as a capture token. Return the user id, or the
 * 401 / 429 response to send.
 */
export async function authenticateOpds(req: Request): Promise<{ userId: string } | Response> {
  const token = parseBasicAuthPassword(req.headers.get("authorization"));
  if (!token) return unauthorized();

  const auth = await lookupCaptureTokenUser(token);
  if (!auth) return unauthorized();

  const rl = await rateLimit(`opds:${auth.userId}`, FEED_LIMIT, FEED_WINDOW_SEC);
  if (!rl.ok) return opdsText("Too many requests", 429, { "Retry-After": String(rl.retryAfter ?? 60) });

  return { userId: auth.userId };
}

/** Every book of the user that has a file. The service role skips RLS, so the user filter is required. */
export async function loadOpdsBooks(userId: string): Promise<OpdsBookRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("items")
    .select(OPDS_BOOK_COLUMNS)
    .eq("user_id", userId)
    .eq("category", "books")
    .not("file_drive_id", "is", null)
    .limit(2000);

  if (error) throw new Error(`opds_load_failed: ${error.message}`);
  return (data ?? []) as OpdsBookRow[];
}

/** The origin for absolute links, from the request the reader sent. */
export function requestOrigin(req: Request): string {
  return new URL(req.url).origin;
}

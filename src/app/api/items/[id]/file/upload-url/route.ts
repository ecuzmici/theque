import { randomUUID } from "node:crypto";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { bookFileTarget, canUseBookFile } from "@/lib/book-file-access";
import { BOOK_UPLOAD_BUCKET, bookUploadPath } from "@/lib/book-upload-staging";
import { isDriveConfigured } from "@/lib/drive/client";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function fail(code: string, status: number): Response {
  return Response.json({ error: code }, { status });
}

/**
 * Give the browser a signed URL in the staging bucket. The browser sends the
 * EPUB there, then calls POST /api/items/:id/file with the path. This step
 * exists because a Vercel Function refuses a request body above 4.5 MB.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return fail("unauthorized", 401);
  if (!canUseBookFile(user.id)) return fail("not_found", 404);

  const rl = await rateLimit(`book-file-url:${user.id}`, 20, 3600);
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 3600) } },
    );
  }

  // Test the configuration before the browser sends 30 MB that cannot go anywhere.
  if (!isDriveConfigured(bookFileTarget(user.id))) return fail("drive_not_configured", 503);

  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: row, error: loadErr } = await supabase.from("items").select("id, user_id").eq("id", id).maybeSingle();
  if (loadErr || !row || row.user_id !== user.id) return fail("not_found", 404);

  const path = bookUploadPath(user.id, id, randomUUID());
  const { data, error } = await createAdminClient().storage.from(BOOK_UPLOAD_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[api/items/:id/file/upload-url] sign_failed:", error?.message ?? "no data");
    return fail("upload_failed", 502);
  }

  return Response.json({ path, signedUrl: data.signedUrl });
}

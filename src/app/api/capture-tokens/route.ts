import { getSessionUserOrNull } from "@/lib/auth/session-user";
import type {
  CaptureTokenCreateResponseBody,
  CaptureTokensListResponseBody,
} from "@/lib/types/api";
import { mintCaptureTokenParts } from "@/lib/auth/capture-token";
import { hasMaxLength, MAX_CAPTURE_TOKEN_NAME_LENGTH } from "@/lib/input-limits";
import { rateLimit } from "@/lib/rate-limit";
import { checkQuota, MAX_CAPTURE_TOKENS_PER_USER } from "@/lib/quotas";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("capture_tokens")
    .select("id, name, token_prefix, created_at, last_used_at, revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/capture-tokens] query_failed:", error.message);
    return Response.json({ code: "query_failed" }, { status: 500 });
  }

  const body: CaptureTokensListResponseBody = { tokens: data ?? [] };
  return Response.json(body);
}

export async function POST(req: Request) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`capture-tokens:${user.id}`, 5, 60);
  if (!rl.ok) {
    return Response.json(
      { code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ code: "invalid_body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || !hasMaxLength(name, MAX_CAPTURE_TOKEN_NAME_LENGTH)) {
    return Response.json({ code: "invalid_name" }, { status: 400 });
  }

  const supabase = await createClient();

  const quota = await checkQuota(supabase, user.id, "capture_tokens", MAX_CAPTURE_TOKENS_PER_USER);
  if (!quota.ok) {
    return Response.json({ code: "quota_exceeded" }, { status: 409 });
  }

  const parts = mintCaptureTokenParts();

  const { data: row, error } = await supabase
    .from("capture_tokens")
    .insert({
      user_id: user.id,
      name,
      token_hash: parts.token_hash,
      token_prefix: parts.token_prefix,
    })
    .select("id, name, token_prefix, created_at")
    .single();

  if (error || !row) {
    console.error("[api/capture-tokens] insert_failed:", error?.message);
    return Response.json({ code: "insert_failed" }, { status: 500 });
  }

  const res: CaptureTokenCreateResponseBody = {
    id: row.id,
    name: row.name,
    token: parts.token,
    token_prefix: row.token_prefix,
    created_at: row.created_at,
  };

  return Response.json(res, { status: 201 });
}

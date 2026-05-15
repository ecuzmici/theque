import { getSessionUserOrNull } from "@/lib/auth/session-user";
import type { CaptureTokenCreateResponseBody } from "@/lib/types/api";
import { mintCaptureTokenParts } from "@/lib/auth/capture-token";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ code: "invalid_body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return Response.json({ code: "invalid_name" }, { status: 400 });
  }

  const parts = mintCaptureTokenParts();
  const supabase = await createClient();

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
    return Response.json({ code: "insert_failed", detail: error?.message }, { status: 500 });
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

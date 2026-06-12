import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { hasMaxLength, MAX_URL_LENGTH } from "@/lib/input-limits";
import { createClient } from "@/lib/supabase/server";
import { fingerprint } from "@/lib/url/fingerprint";
import { normalizeUrl } from "@/lib/url/normalize";

/** GET /api/items/check-url?url=… — duplicate lookup before capture. */
export async function GET(req: Request) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const raw = new URL(req.url).searchParams.get("url");
  if (!raw || !hasMaxLength(raw, MAX_URL_LENGTH)) {
    return Response.json({ code: "invalid_url" }, { status: 400 });
  }

  let canonical: string;
  try {
    canonical = normalizeUrl(raw);
  } catch {
    return Response.json({ code: "invalid_url" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("id, title, domain, status, created_at")
    .eq("url_fingerprint", fingerprint(canonical))
    .maybeSingle();

  return Response.json({ existing: data ?? null });
}

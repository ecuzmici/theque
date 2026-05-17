import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("capture_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .select("id");

  if (error) {
    console.error("[api/capture-tokens/:id] update_failed:", error.message);
    return Response.json({ code: "update_failed" }, { status: 500 });
  }

  if (!rows?.length) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}

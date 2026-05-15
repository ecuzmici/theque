import { getSessionUserOrNull } from "@/lib/auth/session-user";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

type CollectionUpdate = Database["public"]["Tables"]["collections"]["Update"];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ code: "invalid_body" }, { status: 400 });
  }

  const patch: CollectionUpdate = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return Response.json({ code: "invalid_name" }, { status: 400 });
    patch.name = name;
  }

  if (typeof body.description === "string" || body.description === null) {
    patch.description = body.description === null ? null : body.description;
  }

  if (!Object.keys(patch).length) {
    return Response.json({ code: "empty_patch" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("collections")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*");

  if (error) {
    if (error.code === "23505") {
      return Response.json({ code: "duplicate_name" }, { status: 409 });
    }
    return Response.json({ code: "update_failed", detail: error.message }, { status: 500 });
  }

  if (!rows?.length) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  return Response.json(rows[0]);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: deleted, error } = await supabase
    .from("collections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return Response.json({ code: "delete_failed", detail: error.message }, { status: 500 });
  }

  if (!deleted?.length) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}

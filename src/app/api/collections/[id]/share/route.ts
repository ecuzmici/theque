import { randomBytes } from "node:crypto";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { createClient } from "@/lib/supabase/server";

async function loadOwnedCollection(id: string) {
  const user = await getSessionUserOrNull();
  if (!user) return { user: null, collection: null, supabase: null } as const;

  const supabase = await createClient();
  const { data } = await supabase
    .from("collections")
    .select("id, user_id, share_token")
    .eq("id", id)
    .maybeSingle();

  if (!data || data.user_id !== user.id) {
    return { user, collection: null, supabase } as const;
  }
  return { user, collection: data, supabase } as const;
}

/** POST /api/collections/:id/share — create (or return) the read-only share token. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, collection, supabase } = await loadOwnedCollection(id);
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });
  if (!collection || !supabase) return Response.json({ code: "not_found" }, { status: 404 });

  if (collection.share_token) {
    return Response.json({ share_token: collection.share_token });
  }

  const token = randomBytes(16).toString("hex");
  const { error } = await supabase
    .from("collections")
    .update({ share_token: token })
    .eq("id", id);

  if (error) {
    console.error("[api/collections/:id/share] update_failed:", error.message);
    return Response.json({ code: "update_failed" }, { status: 500 });
  }
  return Response.json({ share_token: token });
}

/** DELETE /api/collections/:id/share — revoke the share link. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, collection, supabase } = await loadOwnedCollection(id);
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });
  if (!collection || !supabase) return Response.json({ code: "not_found" }, { status: 404 });

  const { error } = await supabase
    .from("collections")
    .update({ share_token: null })
    .eq("id", id);

  if (error) {
    console.error("[api/collections/:id/share] revoke_failed:", error.message);
    return Response.json({ code: "revoke_failed" }, { status: 500 });
  }
  return Response.json({ share_token: null });
}

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { hasMaxLength, MAX_TAG_NAME_LENGTH } from "@/lib/input-limits";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`tags:${user.id}`, 60, 60);
  if (!rl.ok) {
    return Response.json(
      { code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } },
    );
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ code: "invalid_body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
  if (!name || !hasMaxLength(name, MAX_TAG_NAME_LENGTH)) {
    return Response.json({ code: "invalid_name" }, { status: 400 });
  }

  const supabase = await createClient();

  // Verify the tag belongs to the user
  const { data: sourceTag, error: fetchError } = await supabase
    .from("tags")
    .select("id, name")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    console.error("[api/tags/[id]] fetch_failed:", fetchError.message);
    return Response.json({ code: "query_failed" }, { status: 500 });
  }

  if (!sourceTag) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }

  // Check if a tag with the new name already exists (merge scenario)
  const { data: existingTag } = await supabase
    .from("tags")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", name)
    .maybeSingle();

  if (existingTag && existingTag.id !== id) {
    // Merge: repoint item_tags from source tag to target tag, then delete source
    const targetId = existingTag.id;

    // Get item_ids already linked to target to avoid duplicate constraint violations
    const { data: alreadyLinked } = await supabase
      .from("item_tags")
      .select("item_id")
      .eq("tag_id", targetId);

    const alreadyLinkedSet = new Set((alreadyLinked ?? []).map((r) => r.item_id));

    const { data: sourceLinks } = await supabase
      .from("item_tags")
      .select("item_id")
      .eq("tag_id", id);

    const toMove = (sourceLinks ?? [])
      .map((r) => r.item_id)
      .filter((itemId) => !alreadyLinkedSet.has(itemId));

    if (toMove.length > 0) {
      const { error: insertError } = await supabase.from("item_tags").insert(
        toMove.map((itemId) => ({ item_id: itemId, tag_id: targetId })),
      );
      if (insertError) {
        console.error("[api/tags/[id]] merge_insert_failed:", insertError.message);
        return Response.json({ code: "merge_failed" }, { status: 500 });
      }
    }

    // Delete source tag (cascade removes remaining item_tags for that tag)
    const { error: deleteError } = await supabase
      .from("tags")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("[api/tags/[id]] merge_delete_failed:", deleteError.message);
      return Response.json({ code: "merge_failed" }, { status: 500 });
    }

    return Response.json({ id: targetId, name, merged: true });
  }

  // Simple rename
  const { data: updated, error: updateError } = await supabase
    .from("tags")
    .update({ name })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name")
    .single();

  if (updateError) {
    if (updateError.code === "23505") {
      return Response.json({ code: "duplicate_name" }, { status: 409 });
    }
    console.error("[api/tags/[id]] update_failed:", updateError.message);
    return Response.json({ code: "update_failed" }, { status: 500 });
  }

  return Response.json({ id: updated.id, name: updated.name, merged: false });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`tags:${user.id}`, 60, 60);
  if (!rl.ok) {
    return Response.json(
      { code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } },
    );
  }

  const { id } = await params;

  const supabase = await createClient();

  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[api/tags/[id]] delete_failed:", error.message);
    return Response.json({ code: "delete_failed" }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}

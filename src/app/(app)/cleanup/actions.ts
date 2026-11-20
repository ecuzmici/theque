"use server";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { parseItemId, parseRestoredKeptAt } from "@/lib/cleanup/kept-at";
import { createClient } from "@/lib/supabase/server";

export type KeepResult = { ok: true; keptAt: string | null } | { ok: false };

/**
 * Writes `kept_at` on one `want` item of the signed-in user. The session
 * client applies RLS, so a user can change only their own items.
 */
async function writeKeptAt(rawId: unknown, keptAt: string | null): Promise<KeepResult> {
  const id = parseItemId(rawId);
  if (!id) return { ok: false };
  const user = await getSessionUserOrNull();
  if (!user) return { ok: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .update({ kept_at: keptAt })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "want")
    .select("kept_at");
  if (error) {
    console.error("[cleanup] kept_at_update_failed:", error.message);
    return { ok: false };
  }
  if (data?.length !== 1) return { ok: false };
  return { ok: true, keptAt: data[0]!.kept_at };
}

/** "Keep": the forgotten age of the item starts again now. */
export async function keepItem(id: string): Promise<KeepResult> {
  return writeKeptAt(id, new Date().toISOString());
}

/** Undo of "Keep": puts back the `kept_at` value from before the keep. */
export async function restoreKeptAt(id: string, keptAt: string | null): Promise<KeepResult> {
  const parsed = parseRestoredKeptAt(keptAt);
  if (!parsed.ok) return { ok: false };
  return writeKeptAt(id, parsed.value);
}

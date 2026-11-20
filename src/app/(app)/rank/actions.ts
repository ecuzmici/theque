"use server";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { checkAgainstItems, parseRankWrites } from "@/lib/rank/writes";
import { createClient } from "@/lib/supabase/server";

export type SaveRankResult = { ok: true } | { ok: false; error: string };

/**
 * Saves head-to-head keys to `items.rank_order`. It uses the session client,
 * so RLS limits every read and write to the signed-in user's rows. It checks
 * each key against the current rating of its item (see src/lib/rank/rank-key.ts).
 */
export async function saveRankOrders(input: unknown): Promise<SaveRankResult> {
  const user = await getSessionUserOrNull();
  if (!user) return { ok: false, error: "Sign in again to save." };

  const writes = parseRankWrites(input);
  if (!writes) return { ok: false, error: "That ranking did not save." };

  const supabase = await createClient();
  const { data: rows, error: readError } = await supabase
    .from("items")
    .select("id, status, category, rating_personal")
    .in(
      "id",
      writes.map((w) => w.id),
    );
  if (readError) return { ok: false, error: "That ranking did not save." };
  if (!checkAgainstItems(writes, rows ?? [])) {
    return { ok: false, error: "A rating changed. Reload the page to rank again." };
  }

  const results = await Promise.all(
    writes.map(({ id, rankOrder }) =>
      supabase.from("items").update({ rank_order: rankOrder }).eq("id", id).eq("user_id", user.id),
    ),
  );
  if (results.some((r) => r.error)) return { ok: false, error: "That ranking did not save." };
  return { ok: true };
}

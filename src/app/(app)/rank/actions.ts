"use server";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { parseRankWrites } from "@/lib/rank/writes";
import { createClient } from "@/lib/supabase/server";

export type SaveRankResult = { ok: true } | { ok: false; error: string };

/**
 * Saves head-to-head keys to `items.rank_order` in one batch. The RPC
 * `set_item_rank_orders` is security invoker, so RLS applies. It checks each
 * key against the current rating of a done item, and it rolls back the whole
 * batch when one row does not match (see src/lib/rank/rank-key.ts).
 */
export async function saveRankOrders(input: unknown): Promise<SaveRankResult> {
  const user = await getSessionUserOrNull();
  if (!user) return { ok: false, error: "Sign in again to save." };

  const writes = parseRankWrites(input);
  if (!writes) return { ok: false, error: "That ranking did not save." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_item_rank_orders", {
    writes: writes.map(({ id, rankOrder }) => ({ id, rank_order: rankOrder })),
  });
  if (error) {
    return error.code === "22023"
      ? { ok: false, error: "A rating changed. Reload the page to rank again." }
      : { ok: false, error: "That ranking did not save." };
  }
  return { ok: true };
}

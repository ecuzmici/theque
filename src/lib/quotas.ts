import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const MAX_ITEMS_PER_USER = 10_000;
export const MAX_COLLECTIONS_PER_USER = 500;
export const MAX_TAGS_PER_USER = 2_000;
export const MAX_CAPTURE_TOKENS_PER_USER = 20;

type QuotaTable = "items" | "collections" | "capture_tokens" | "tags";

export async function checkQuota(
  db: SupabaseClient<Database>,
  userId: string,
  table: QuotaTable,
  max: number,
): Promise<{ ok: boolean }> {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    console.error(`[quotas] count_failed (${table}):`, error.message);
    // Fail open: if we can't count, allow the operation.
    return { ok: true };
  }

  return { ok: (count ?? 0) < max };
}

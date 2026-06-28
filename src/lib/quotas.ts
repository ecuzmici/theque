export const MAX_ITEMS_PER_USER = 10_000;
export const MAX_CAPTURE_TOKENS_PER_USER = 20;

type QuotaTable = "items" | "capture_tokens";

export async function checkQuota(
  db: import("@supabase/supabase-js").SupabaseClient<import("@/lib/database.types").Database>,
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
    return { ok: true };
  }

  return { ok: (count ?? 0) < max };
}

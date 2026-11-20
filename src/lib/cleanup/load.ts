import "server-only";

import { redirect } from "next/navigation";

import type { CleanupItem } from "@/components/cleanup/SpringCleaning";
import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { cleanDisplayTitle } from "@/lib/display-title";
import { getCoverImageUrls } from "@/lib/item-display";
import { applyShelfFilter } from "@/lib/library-items-for-shelf";
import { getShelf } from "@/lib/shelves";
import { createClient } from "@/lib/supabase/server";

/** PostgREST returns at most this many rows in one response. */
const MAX_ITEMS = 1000;

function firstString(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const first = value.find((v): v is string => typeof v === "string" && !!v.trim());
  return first ?? null;
}

function year(value: unknown): number | null {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Loads the forgotten items of the signed-in user for a spring-cleaning pass,
 * oldest first. The query uses the Forgotten shelf rule (shelves.ts) and the
 * session client, so RLS limits the rows to that user. A guest goes to /login.
 * `now` is the moment of the load, so the server and the client use one cutoff.
 */
export async function loadCleanupPass(): Promise<{ items: CleanupItem[]; now: number }> {
  const [supabase, user] = await Promise.all([createClient(), getSessionUserOrNull()]);
  if (!user) redirect("/login?next=%2Fcleanup");

  const now = Date.now();
  const query = supabase
    .from("items")
    .select(
      "id, title, subtitle, category, status, created_at, kept_at, pinned_at, dominant_color, image_url, image_storage_path, structured",
    );
  const { data, error } = await applyShelfFilter(query, getShelf("forgotten"))
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_ITEMS);
  if (error) throw new Error(error.message);

  // The query reads no encrypted column (note, verdict), so no decrypt step is necessary (ADR 0013).
  const items = (data ?? []).map((row): CleanupItem => {
    const s =
      row.structured && typeof row.structured === "object" && !Array.isArray(row.structured)
        ? (row.structured as Record<string, unknown>)
        : {};
    return {
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      kept_at: row.kept_at,
      pinned_at: row.pinned_at,
      title: cleanDisplayTitle(row.title ?? "Untitled"),
      byline: firstString(s.authors) ?? firstString(s.directors) ?? row.subtitle ?? null,
      year: year(s.published_year) ?? year(s.year),
      category: row.category,
      color: row.dominant_color,
      cover: getCoverImageUrls(row.image_storage_path, row.image_url),
    };
  });
  return { items, now };
}

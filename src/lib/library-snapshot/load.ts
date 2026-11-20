import "server-only";

import { redirect } from "next/navigation";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { decryptItemFields } from "@/lib/crypto/field-crypto";
import type { ItemCategory } from "@/lib/database.types";
import { cleanDisplayTitle } from "@/lib/display-title";
import { getCoverImageUrls } from "@/lib/item-display";
import { createClient } from "@/lib/supabase/server";

/**
 * One library item in the flat shape that the "You" pages read: radar, rank,
 * wrapped, diary, map and cleanup. The loader decrypts `verdict` (ADR 0013).
 */
export type SnapshotItem = {
  id: string;
  title: string;
  subtitle: string | null;
  category: ItemCategory | null;
  status: string;
  rating: number | null;
  verdict: string | null;
  doneAt: string | null;
  createdAt: string;
  keptAt: string | null;
  rankOrder: number | null;
  color: string | null;
  cover: { src: string; fallback: string | null } | null;
  coverFull: string | null;
  genres: string[];
  moods: string[];
  url: string;
  authors: string[];
  directors: string[];
  series: string | null;
  seriesIndex: number | null;
  pages: number | null;
  runtime: number | null;
  year: number | null;
  isbn: string | null;
};

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Loads the signed-in user's items (not dismissed) through the session client,
 * so RLS limits the rows to that user. A guest goes to /login with `next`.
 */
export async function loadLibrarySnapshot(nextPath: string): Promise<SnapshotItem[]> {
  const [supabase, user] = await Promise.all([createClient(), getSessionUserOrNull()]);
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  const { data, error } = await supabase
    .from("items")
    .select(
      "id, title, subtitle, category, status, rating_personal, verdict, done_at, created_at, kept_at, rank_order, dominant_color, image_url, image_storage_path, genre_keys, mood_keys, canonical_url, structured",
    )
    .neq("status", "dismissed")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);

  return (data ?? []).map((raw) => {
    const row = decryptItemFields(raw);
    const s =
      row.structured && typeof row.structured === "object" && !Array.isArray(row.structured)
        ? (row.structured as Record<string, unknown>)
        : {};
    const urls = getCoverImageUrls(row.image_storage_path, row.image_url);
    return {
      id: row.id,
      title: cleanDisplayTitle(row.title ?? "Untitled"),
      subtitle: row.subtitle,
      category: row.category,
      status: row.status,
      rating: row.rating_personal,
      verdict: row.verdict,
      doneAt: row.done_at,
      createdAt: row.created_at,
      keptAt: row.kept_at,
      rankOrder: row.rank_order,
      color: row.dominant_color,
      cover: urls,
      coverFull: urls?.fallback ?? urls?.src ?? null,
      genres: row.genre_keys ?? [],
      moods: row.mood_keys ?? [],
      url: row.canonical_url,
      authors: list(s.authors),
      directors: list(s.directors),
      series: typeof s.series === "string" && s.series.trim() ? s.series.trim() : null,
      seriesIndex: num(s.series_index),
      pages: num(s.page_count),
      runtime: num(s.runtime_minutes),
      year: num(s.published_year) ?? num(s.year),
      isbn: typeof s.isbn === "string" ? s.isbn : null,
    };
  });
}

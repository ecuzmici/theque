import "server-only";

import { redirect } from "next/navigation";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { decryptItemFields } from "@/lib/crypto/field-crypto";
import type { ItemCategory } from "@/lib/database.types";
import { cleanDisplayTitle } from "@/lib/display-title";
import { getCoverImageUrls } from "@/lib/item-display";
import { createClient } from "@/lib/supabase/server";

/**
 * Read-only library snapshot for the idea lab. The lab never writes: every
 * prototype works on this copy of the data and keeps its state in the browser.
 */
export type LabItem = {
  id: string;
  title: string;
  subtitle: string | null;
  category: ItemCategory | null;
  status: string;
  rating: number | null;
  verdict: string | null;
  doneAt: string | null;
  createdAt: string;
  color: string | null;
  cover: { src: string; fallback: string | null } | null;
  coverFull: string | null;
  genres: string[];
  moods: string[];
  hasFile: boolean;
  url: string;
  authors: string[];
  directors: string[];
  series: string | null;
  seriesIndex: number | null;
  pages: number | null;
  runtime: number | null;
  year: number | null;
  isbn: string | null;
  sourceGenres: string[];
};

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

export async function loadLabItems(): Promise<LabItem[]> {
  const [supabase, user] = await Promise.all([createClient(), getSessionUserOrNull()]);
  if (!user) redirect("/login?next=/lab");

  const { data, error } = await supabase
    .from("items")
    .select(
      "id, title, subtitle, category, status, rating_personal, verdict, done_at, created_at, dominant_color, image_url, image_storage_path, genre_keys, mood_keys, file_uploaded_at, canonical_url, structured",
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
      color: row.dominant_color,
      cover: urls,
      coverFull: urls?.fallback ?? urls?.src ?? null,
      genres: row.genre_keys ?? [],
      moods: row.mood_keys ?? [],
      hasFile: Boolean(row.file_uploaded_at),
      url: row.canonical_url,
      authors: list(s.authors),
      directors: list(s.directors),
      series: typeof s.series === "string" && s.series.trim() ? s.series.trim() : null,
      seriesIndex: num(s.series_index),
      pages: num(s.page_count),
      runtime: num(s.runtime_minutes),
      year: num(s.published_year) ?? num(s.year),
      isbn: typeof s.isbn === "string" ? s.isbn : null,
      sourceGenres: list(s.genres),
    };
  });
}

/**
 * The request time, read one time on the server and passed to client
 * components, so the server and the browser render the same day counts.
 */
export function labNow(): number {
  return Date.now();
}

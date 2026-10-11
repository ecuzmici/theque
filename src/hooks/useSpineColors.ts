"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/** Same pool size as the Spine Band: PostgREST's default max page. */
const COLOR_FETCH_LIMIT = 1000;

/**
 * The library's `dominant_color` values, newest first. The notch header draws
 * them as spines. Best-effort: an error gives an empty list and no spines.
 */
export function useSpineColors(): string[] {
  const [colors, setColors] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await createClient()
          .from("items")
          .select("dominant_color")
          .neq("status", "dismissed")
          .not("dominant_color", "is", null)
          .order("created_at", { ascending: false })
          .limit(COLOR_FETCH_LIMIT);
        if (cancelled) return;
        setColors(
          (data ?? [])
            .map((row) => row.dominant_color)
            .filter((color): color is string => Boolean(color)),
        );
      } catch {
        // No colors means a plain outline.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return colors;
}

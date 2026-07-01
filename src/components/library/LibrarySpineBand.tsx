"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { FORGOTTEN_AFTER_DAYS, getShelf, olderThanCutoff } from "@/lib/shelves";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type SpineCounts = {
  total: number;
  recentlyAdded: number;
  inboxBacklog: number;
  forgotten: number;
};

/**
 * Colors fetched (most recent first) before client-side sampling. We pull the
 * whole library (1000 = PostgREST's default max page) rather than just the most
 * recent few, so the band is a true cross-section that re-balances as the
 * library grows.
 */
const COLOR_FETCH_LIMIT = 1000;
/** Desired spine width in px; the rendered spine count scales with the band width. */
const TARGET_SPINE_PX = 3.5;
/** Hard cap on rendered spines so the DOM stays light at any library size. */
const MAX_SPINES = 400;
/** Below this many colors, a band looks broken rather than intentional. */
const MIN_SPINES_FOR_BAND = 8;

const NUDGE_LINK_CLASSES =
  "rounded text-amber-600 transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 dark:text-amber-400";

/**
 * Evenly samples `items` down to at most `max` entries by taking every
 * `Math.ceil(items.length / max)`-th element. Deterministic stride sampling —
 * simple, and keeps the eclectic (as-fetched) order intact rather than
 * re-sorting.
 */
export function sampleEvenly<T>(items: T[], max: number): T[] {
  if (max <= 0) return [];
  if (items.length <= max) return items;
  const stride = Math.ceil(items.length / max);
  const sampled: T[] = [];
  for (let i = 0; i < items.length; i += stride) {
    sampled.push(items[i]);
  }
  return sampled;
}

/**
 * The Spine Band — a thin strip of the library's own `dominant_color` values
 * (saved items seen edge-on, like book spines on a shelf) plus a quiet caption
 * with the same counts `LibraryInsights` used to report as KPI tiles. The spine
 * count is sampled across the whole library and scales with the band's width, so
 * the weave stays ~3-4px per spine on any device and grows denser as the library
 * grows. Replaces the old metrics strip; see docs/adr/0012-library-spine-band.md.
 */
export function LibrarySpineBand() {
  const [counts, setCounts] = useState<SpineCounts | null>(null);
  const [colorPool, setColorPool] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [bandVisible, setBandVisible] = useState(false);
  const [bandWidth, setBandWidth] = useState(0);
  const bandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      let nextCounts: SpineCounts | null = null;
      try {
        // Total items (non-dismissed)
        const { count: total } = await supabase
          .from("items")
          .select("id", { count: "exact", head: true })
          .neq("status", "dismissed");

        // Recently added (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count: recentlyAdded } = await supabase
          .from("items")
          .select("id", { count: "exact", head: true })
          .gte("created_at", sevenDaysAgo)
          .neq("status", "dismissed");

        // Inbox backlog
        const { count: inboxBacklog } = await supabase
          .from("items")
          .select("id", { count: "exact", head: true })
          .eq("status", "inbox");

        // Forgotten: `want` items older than FORGOTTEN_AFTER_DAYS. Mirrors the
        // `forgotten` shelf filter (status + olderThanCutoff) so the age rule has
        // a single source — no duplicated 180-day logic.
        const forgottenFilter = getShelf("forgotten").filter;
        let forgottenQuery = supabase
          .from("items")
          .select("id", { count: "exact", head: true });
        if (forgottenFilter.status) {
          forgottenQuery = forgottenQuery.eq("status", forgottenFilter.status);
        }
        forgottenQuery = forgottenQuery.lt(
          "created_at",
          olderThanCutoff(forgottenFilter.olderThanDays ?? FORGOTTEN_AFTER_DAYS).toISOString(),
        );
        const { count: forgotten } = await forgottenQuery;

        nextCounts = {
          total: total ?? 0,
          recentlyAdded: recentlyAdded ?? 0,
          inboxBacklog: inboxBacklog ?? 0,
          forgotten: forgotten ?? 0,
        };
      } catch {
        // Counts are best-effort; fail silently (no band, no error).
      }

      let nextColors: string[] = [];
      try {
        const { data } = await supabase
          .from("items")
          .select("dominant_color")
          .neq("status", "dismissed")
          .not("dominant_color", "is", null)
          .order("created_at", { ascending: false })
          .limit(COLOR_FETCH_LIMIT);

        nextColors = (data ?? [])
          .map((row) => row.dominant_color)
          .filter((color): color is string => Boolean(color));
      } catch {
        // The color read is best-effort too; a failed fetch just means no band.
      }

      if (cancelled) return;
      setCounts(nextCounts);
      setColorPool(nextColors);
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Fade the band in once it has something to show, instead of popping in.
  useEffect(() => {
    if (!loaded) return;
    const id = requestAnimationFrame(() => setBandVisible(true));
    return () => cancelAnimationFrame(id);
  }, [loaded]);

  // Track the band's rendered width so the spine count can scale with it (a wider
  // band gets more, thinner spines; mobile gets fewer so they don't go sub-pixel).
  useEffect(() => {
    const el = bandRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setBandWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded, colorPool.length]);

  if (!loaded) {
    // Reserve the full loaded height (band + caption line + rule) so the tabs below
    // don't jump once data arrives — mirrors the loaded layout's box model exactly.
    return (
      <div className="mb-5" aria-hidden="true">
        <div className="mb-3 h-11 w-full rounded-lg bg-muted/20 motion-safe:animate-pulse" />
        <div className="h-5 w-48 max-w-[60%] rounded bg-muted/20" />
        <div className="mt-4 border-t border-border" />
      </div>
    );
  }

  if (counts === null || counts.total === 0) return null;

  const showBand = colorPool.length >= MIN_SPINES_FOR_BAND;
  const showInboxNudge = counts.inboxBacklog > 0;
  const showForgottenNudge = counts.forgotten > 0;

  // Spine count tracks the band's width (~one spine per TARGET_SPINE_PX), capped
  // for the DOM and never more than the colors we actually have. Before the width
  // is measured we fall back to the cap; the ResizeObserver corrects within a frame.
  const targetCount =
    bandWidth > 0
      ? Math.max(
          MIN_SPINES_FOR_BAND,
          Math.min(MAX_SPINES, Math.round(bandWidth / TARGET_SPINE_PX)),
        )
      : MAX_SPINES;
  const spines = sampleEvenly(colorPool, targetCount);

  return (
    <div className="mb-5">
      {showBand ? (
        <div
          ref={bandRef}
          className={cn(
            "mb-3 flex h-11 overflow-hidden rounded-lg transition-opacity duration-500 ease-out",
            bandVisible ? "opacity-100" : "opacity-0",
          )}
          style={{ filter: "saturate(0.66)" }}
          aria-hidden="true"
        >
          {spines.map((color, i) => (
            <div key={i} className="flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <p className="text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{counts.total}</span>{" "}
          spines ·{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {counts.recentlyAdded}
          </span>{" "}
          new this week
        </p>
        {showInboxNudge || showForgottenNudge ? (
          <p className="flex items-baseline gap-1 text-muted-foreground">
            {showInboxNudge ? (
              <Link href="/library?shelf=inbox" className={NUDGE_LINK_CLASSES}>
                {counts.inboxBacklog} to sort
              </Link>
            ) : null}
            {showInboxNudge && showForgottenNudge ? <span aria-hidden="true">·</span> : null}
            {showForgottenNudge ? (
              <Link href="/library?shelf=forgotten" className={NUDGE_LINK_CLASSES}>
                {counts.forgotten} forgotten
              </Link>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="mt-4 border-t border-border" />
    </div>
  );
}

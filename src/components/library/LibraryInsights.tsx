"use client";

import { useEffect, useState } from "react";

import { SHELVES, type ShelfId } from "@/lib/shelves";
import { createClient } from "@/lib/supabase/client";

type InsightCounts = {
  total: number;
  recentlyAdded: number;
  inboxBacklog: number;
  shelfCounts: Partial<Record<ShelfId, number>>;
};

// Shelves to show per-shelf counts for (skip "all" and "inbox" since those are separate)
const INSIGHT_SHELVES: ShelfId[] = ["books", "watch", "read", "cook", "eat", "shop", "travel", "listen", "tools"];

export function LibraryInsights() {
  const [counts, setCounts] = useState<InsightCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
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

        if (cancelled) return;

        setCounts({
          total: total ?? 0,
          recentlyAdded: recentlyAdded ?? 0,
          inboxBacklog: inboxBacklog ?? 0,
          shelfCounts: {},
        });
      } catch {
        // Insights are best-effort; fail silently
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!counts) return null;

  const stats = [
    { label: "Total saves", value: counts.total },
    { label: "Added this week", value: counts.recentlyAdded },
    ...(counts.inboxBacklog > 0 ? [{ label: "Inbox backlog", value: counts.inboxBacklog, highlight: true }] : []),
  ];

  if (stats.every((s) => s.value === 0)) return null;

  return (
    <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-border bg-muted/30 px-4 py-3">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-baseline gap-1.5">
          <span
            className={
              "text-lg font-semibold tabular-nums leading-none " +
              (stat.highlight ? "text-amber-600 dark:text-amber-400" : "text-foreground")
            }
          >
            {stat.value}
          </span>
          <span className="text-xs text-muted-foreground">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

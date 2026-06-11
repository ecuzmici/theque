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
    <p className="mb-5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
      {stats.map((stat, i) => (
        <span key={stat.label}>
          {i > 0 ? <span aria-hidden> · </span> : null}
          <span
            className={
              "font-semibold tabular-nums " + (stat.highlight ? "text-primary" : "text-foreground")
            }
          >
            {stat.value}
          </span>{" "}
          {stat.label}
        </span>
      ))}
    </p>
  );
}

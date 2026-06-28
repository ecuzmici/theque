"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  FORGOTTEN_AFTER_DAYS,
  getShelf,
  olderThanCutoff,
  type ShelfId,
} from "@/lib/shelves";
import { createClient } from "@/lib/supabase/client";

type InsightCounts = {
  total: number;
  recentlyAdded: number;
  inboxBacklog: number;
  forgotten: number;
  shelfCounts: Partial<Record<ShelfId, number>>;
};

// Shelves to show per-shelf counts for (skip "all" and "inbox" since those are separate)
const INSIGHT_SHELVES: ShelfId[] = ["books", "watch", "read", "other"];

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

        if (cancelled) return;

        setCounts({
          total: total ?? 0,
          recentlyAdded: recentlyAdded ?? 0,
          inboxBacklog: inboxBacklog ?? 0,
          forgotten: forgotten ?? 0,
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

  const stats: {
    label: string;
    value: number;
    highlight?: boolean;
    href?: string;
  }[] = [
    { label: "Total saves", value: counts.total },
    { label: "Added this week", value: counts.recentlyAdded },
    ...(counts.inboxBacklog > 0
      ? [{ label: "Inbox backlog", value: counts.inboxBacklog, highlight: true }]
      : []),
    // Forgotten is no longer a tab; the chip is the in-app path back to those
    // old wants. Hidden at zero, like the other dynamic stats.
    ...(counts.forgotten > 0
      ? [
          {
            label: "forgotten",
            value: counts.forgotten,
            highlight: true,
            href: "/library?shelf=forgotten",
          },
        ]
      : []),
  ];

  if (stats.every((s) => s.value === 0)) return null;

  return (
    <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-border bg-muted/30 px-4 py-3">
      {stats.map((stat) => {
        const content = (
          <>
            <span
              className={
                "text-lg font-semibold tabular-nums leading-none " +
                (stat.highlight ? "text-amber-600 dark:text-amber-400" : "text-foreground")
              }
            >
              {stat.value}
            </span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </>
        );
        return stat.href ? (
          <Link
            key={stat.label}
            href={stat.href}
            className="flex items-baseline gap-1.5 rounded transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {content}
          </Link>
        ) : (
          <div key={stat.label} className="flex items-baseline gap-1.5">
            {content}
          </div>
        );
      })}
    </div>
  );
}

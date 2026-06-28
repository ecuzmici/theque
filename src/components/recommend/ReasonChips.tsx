"use client";

import type { RecommendDismissReason } from "@/lib/recommend/recommend-types";

const REASON_OPTIONS: { label: string; value: RecommendDismissReason }[] = [
  { label: "Not my thing", value: "not_my_thing" },
  { label: "Already seen it", value: "already_seen" },
  { label: "Not right now", value: "not_right_now" },
];

export function ReasonChips({
  onPick,
  label = "Why not?",
}: {
  onPick: (reason: RecommendDismissReason) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {REASON_OPTIONS.map(({ label: chipLabel, value }) => (
        <button
          key={value}
          type="button"
          onClick={() => onPick(value)}
          className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {chipLabel}
        </button>
      ))}
    </div>
  );
}

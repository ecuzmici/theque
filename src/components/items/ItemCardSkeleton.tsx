"use client";

export function ItemCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--ks-radius-card)] border border-[color:var(--ks-border)] bg-[color:var(--ks-surface)] shadow-[var(--ks-shadow)]">
      <div className="ks-shimmer aspect-[2/3] bg-[color:var(--ks-bg-muted)]" />
      <div className="space-y-2 p-3">
        <div className="ks-shimmer h-4 w-full rounded bg-[color:var(--ks-bg-muted)]" />
        <div className="ks-shimmer h-3 w-2/3 rounded bg-[color:var(--ks-bg-muted)]" />
      </div>
    </div>
  );
}

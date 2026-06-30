"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ItemCard } from "@/components/items/ItemCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { bucketByMood, type MoodId } from "@/lib/palette/moods";
import type { LibraryItemRow } from "@/lib/types/library-item";
import { cn } from "@/lib/utils";

const ALL_SWATCH =
  "conic-gradient(from 200deg, #d1495b, #d99a2b, #4f9d69, #4f7fd9, #8a5cd9, #d1495b)";

function Swatch({ color }: { color: string }) {
  if (color === "transparent") {
    return <span className="size-3.5 rounded-full border border-dashed border-muted-foreground/60" aria-hidden />;
  }
  return (
    <span
      className="size-3.5 rounded-full ring-1 ring-black/10 dark:ring-white/15"
      style={{ background: color === "conic" ? ALL_SWATCH : color }}
      aria-hidden
    />
  );
}

function MoodChip({
  active,
  onClick,
  swatch,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  swatch: string;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "ks-pointer-coarse-min-hit inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      <Swatch color={swatch} />
      <span className="font-medium">{label}</span>
      <span className={cn("text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
        {count}
      </span>
    </button>
  );
}

export function MoodBrowseView({ items, capped }: { items: LibraryItemRow[]; capped?: boolean }) {
  const buckets = useMemo(() => bucketByMood(items), [items]);
  const [active, setActive] = useState<MoodId | null>(null);

  if (items.length === 0) {
    return (
      <>
        <PageHeader title="Palette" description="Your library, arranged by the colours of its covers." />
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <p className="font-heading text-xl tracking-tight text-foreground">No colours to mix yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Once you save a few things, thèque pulls the dominant colour from each cover and arranges
            them here by mood.
          </p>
          <Link
            href="/add"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Add your first link
          </Link>
        </div>
      </>
    );
  }

  const visible = active ? buckets.filter((b) => b.mood.id === active) : buckets;

  return (
    <>
      <PageHeader
        title="Palette"
        description="Your library, arranged by the colours of its covers. Tap a mood to filter."
      />

      <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Filter by mood">
        <MoodChip active={active === null} onClick={() => setActive(null)} swatch="conic" label="All" count={items.length} />
        {buckets.map((b) => (
          <MoodChip
            key={b.mood.id}
            active={active === b.mood.id}
            onClick={() => setActive((cur) => (cur === b.mood.id ? null : b.mood.id))}
            swatch={b.mood.swatch}
            label={b.mood.label}
            count={b.items.length}
          />
        ))}
      </div>

      <div
        key={active ?? "all"}
        className="flex flex-col gap-12 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
      >
        {visible.map((b) => (
          <section key={b.mood.id} aria-labelledby={`mood-${b.mood.id}`}>
            <div className="mb-1 flex items-center gap-2.5">
              {b.mood.swatch === "transparent" ? (
                <Swatch color="transparent" />
              ) : (
                <span
                  className="size-5 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                  style={{ background: b.mood.swatch }}
                  aria-hidden
                />
              )}
              <h2 id={`mood-${b.mood.id}`} className="font-heading text-xl tracking-tight text-foreground">
                {b.mood.label}
              </h2>
              <span className="text-sm text-muted-foreground">{b.items.length}</span>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">{b.mood.blurb}</p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
              {b.items.map((item) => (
                <li key={item.id}>
                  <ItemCard item={item} shelfId="all" />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {capped ? (
        <p className="mt-10 text-center text-xs text-muted-foreground">
          Showing your most recent {items.length} items.
        </p>
      ) : null}
    </>
  );
}

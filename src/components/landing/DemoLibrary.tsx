"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Palette } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCategory } from "@/lib/item-labels";
import {
  DEMO_ITEMS,
  DEMO_SHELF_IDS,
  demoCardAspect,
  demoItemsForShelf,
  demoShelfLabel,
  sortDemoItemsByHue,
  type DemoItem,
  type DemoShelfId,
} from "@/lib/demo/demo-library";
import { cn } from "@/lib/utils";

/** Cover colours laid edge-on, echoing the real library's Spine Band. */
function DemoSpineBand() {
  return (
    <div
      className="mb-3 flex h-9 overflow-hidden rounded-lg"
      style={{ filter: "saturate(0.66)" }}
      aria-hidden
    >
      {sortDemoItemsByHue(DEMO_ITEMS).map((item) => (
        <div key={item.id} className="flex-1" style={{ backgroundColor: item.dominantColor }} />
      ))}
    </div>
  );
}

function DemoCard({ item }: { item: DemoItem }) {
  const aspect = demoCardAspect(item.category).replace("/", " / ");
  return (
    <Card className="group gap-0 overflow-hidden py-0 transition hover:ring-foreground/20">
      {/* Typographic cover, tinted with the item's dominant colour (no remote images). */}
      <div
        className="relative w-full"
        style={{ aspectRatio: aspect, backgroundColor: item.dominantColor }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/35" />
        <div className="absolute inset-0 flex flex-col justify-between p-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/65">
            {formatCategory(item.category)}
          </span>
          <div>
            <p className="line-clamp-3 font-serif text-sm font-semibold leading-snug text-white/95">
              {item.title}
            </p>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-white/70">{item.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="p-3">
        <p className="line-clamp-2 font-serif text-[15px] font-semibold leading-snug tracking-tight text-card-foreground">
          {item.title}
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.subtitle}</p>
        {item.status === "done" && item.rating ? (
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <span className="text-amber-600 dark:text-amber-400" aria-hidden>
              {"★".repeat(item.rating)}
            </span>
            <span className="text-muted-foreground">{item.verdict}</span>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{item.domain}</p>
        )}
      </div>
    </Card>
  );
}

/**
 * Logged-out landing-page demo: a real-looking, interactive thèque a visitor can
 * browse — shelf switcher + color sort over a static sample library — to feel the
 * product before signing up. No account, no network, no real data.
 */
export function DemoLibrary() {
  const [activeShelf, setActiveShelf] = useState<DemoShelfId>("all");
  const [colorSort, setColorSort] = useState(false);

  const items = useMemo(() => {
    const forShelf = demoItemsForShelf(activeShelf);
    return colorSort ? sortDemoItemsByHue(forShelf) : forShelf;
  }, [activeShelf, colorSort]);

  return (
    <section aria-label="Browse a sample thèque" className="w-full">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        {/* Window chrome — signals "this is the app". */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </span>
          <p className="ml-1 font-heading text-sm tracking-[0.02em] text-foreground">
            A sample library
          </p>
          <span className="ml-auto rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            Live demo
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <DemoSpineBand />
          <p className="mb-4 text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{DEMO_ITEMS.length}</span>{" "}
            spines · a curated sample of what a thèque feels like
          </p>

          {/* Shelf strip — same pill styling as the real library. */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="tablist" aria-label="Shelves">
            {DEMO_SHELF_IDS.map((id) => {
              const selected = id === activeShelf;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveShelf(id)}
                  className={cn(
                    "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    selected
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border bg-muted text-muted-foreground hover:bg-card hover:text-foreground",
                  )}
                >
                  {demoShelfLabel(id)}
                </button>
              );
            })}
          </div>

          {/* Toolbar — color sort, echoing the real library's palette sort. */}
          <div className="mb-4 mt-1 flex items-center justify-end">
            <button
              type="button"
              aria-pressed={colorSort}
              onClick={() => setColorSort((v) => !v)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                colorSort
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              <Palette className="size-4" aria-hidden />
              Color sort
            </button>
          </div>

          {/* Re-key on shelf/sort so the grid gently fades between views (reduced-motion safe). */}
          <ul
            key={`${activeShelf}:${colorSort}`}
            className="grid grid-cols-2 gap-3 motion-safe:animate-in motion-safe:fade-in sm:grid-cols-3 lg:grid-cols-4 lg:gap-4"
          >
            {items.map((item) => (
              <li key={item.id}>
                <DemoCard item={item} />
              </li>
            ))}
          </ul>

          {/* Sign-up CTA — turn the feeling into an account. */}
          <div className="mt-6 flex flex-col items-center gap-3 border-t border-border pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              This is a sample. Build your own — every link you save becomes a card like these.
            </p>
            <Button
              nativeButton={false}
              render={<Link href="/login" />}
              size="lg"
              className="h-11 min-h-11 px-6 text-base"
            >
              Start your library
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { GridLayout } from "@/components/items/ItemGrid";

/**
 * PROTOTYPE ONLY — floating bar to flip the library grid between layout variants
 * via `?variant=`. Dev-only; delete this file (and the `variant` plumbing) once
 * the layout call is made. Uses `[` / `]` for keyboard cycling to avoid the
 * arrow keys already bound to shelf tabs + card navigation.
 */
export const VARIANTS: { key: string; layout: GridLayout; paged: boolean; label: string }[] = [
  { key: "A", layout: "masonry", paged: false, label: "Column masonry — infinite scroll (current)" },
  { key: "B", layout: "grid", paged: false, label: "Uniform grid — infinite scroll" },
  { key: "C", layout: "justified", paged: false, label: "Justified rows — infinite scroll" },
  { key: "D", layout: "masonry", paged: true, label: "Column masonry — paginated" },
];

export function variantToLayout(variant: string | null): GridLayout {
  return VARIANTS.find((v) => v.key === variant)?.layout ?? "masonry";
}

export function variantIsPaged(variant: string | null): boolean {
  return VARIANTS.find((v) => v.key === variant)?.paged ?? false;
}

export function PrototypeGridSwitcher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("variant") ?? "A";
  const idx = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === current),
  );

  const go = useCallback(
    (delta: number) => {
      const next = VARIANTS[(idx + delta + VARIANTS.length) % VARIANTS.length];
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", next.key);
      router.replace(`/library?${params.toString()}`, { scroll: false });
    },
    [idx, router, searchParams],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "[") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "]") {
        e.preventDefault();
        go(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const active = VARIANTS[idx];

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-full border border-yellow-400/60 bg-neutral-900 px-2 py-1.5 text-sm text-white shadow-lg shadow-black/30">
        <button
          type="button"
          onClick={() => go(-1)}
          className="grid size-8 place-items-center rounded-full hover:bg-white/10"
          aria-label="Previous variant"
        >
          ←
        </button>
        <span className="px-2 tabular-nums">
          <span className="font-mono font-semibold text-yellow-300">{active.key}</span>
          <span className="mx-1.5 text-white/40">·</span>
          <span>{active.label}</span>
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          className="grid size-8 place-items-center rounded-full hover:bg-white/10"
          aria-label="Next variant"
        >
          →
        </button>
        <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/60">
          [ / ]
        </span>
      </div>
    </div>
  );
}

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

type Variant = { key: string; name: string };

/**
 * Prototype bar for round 1 of the taste map: flips between the variants with
 * `?v=`. The arrow keys also flip. Production builds do not show the bar.
 */
export function VariantSwitcher({ variants, current }: { variants: Variant[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  useEffect(() => {
    function go(step: number) {
      const next = variants[(index + step + variants.length) % variants.length]!;
      router.replace(`${pathname}?v=${next.key}`, { scroll: false });
    }
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, pathname, router, variants]);

  if (process.env.NODE_ENV === "production") return null;

  const step = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length]!;
    router.replace(`${pathname}?v=${next.key}`, { scroll: false });
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-1 py-1 text-xs text-white shadow-lg ring-1 ring-white/20">
      <Button variant="ghost" size="icon-sm" className="rounded-full text-white hover:bg-white/10" aria-label="Previous variant" onClick={() => step(-1)}>
        <ChevronLeft />
      </Button>
      <span className="min-w-36 text-center font-mono">
        {variants[index]!.key}: {variants[index]!.name}
      </span>
      <Button variant="ghost" size="icon-sm" className="rounded-full text-white hover:bg-white/10" aria-label="Next variant" onClick={() => step(1)}>
        <ChevronRight />
      </Button>
    </div>
  );
}

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import { Button } from "@/components/ui/button";

type Variant = { key: string; name: string };

const DEV = process.env.NODE_ENV !== "production";

/**
 * Prototype bar for the taste map: flips between the variants with `?v=` and
 * keeps the other query params. The arrow keys also flip. Production builds
 * show no bar and add no key listener.
 */
export function VariantSwitcher({ variants, current }: { variants: Variant[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  const step = useCallback(
    (delta: number) => {
      const next = variants[(index + delta + variants.length) % variants.length]!;
      const params = new URLSearchParams(searchParams.toString());
      params.set("v", next.key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [index, pathname, router, searchParams, variants],
  );

  useEffect(() => {
    if (!DEV) return;
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      // A focused control owns its arrow keys.
      if (target?.closest("input, textarea, select, button, a[href], [contenteditable], [role], [tabindex]")) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  if (!DEV) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-1 py-1 text-xs text-white shadow-lg ring-1 ring-white/20">
      <Button variant="ghost" size="icon-sm" className="rounded-full text-white hover:bg-white/10" aria-label="Previous variant" onClick={() => step(-1)}>
        <ChevronLeft />
      </Button>
      <span className="min-w-32 text-center font-mono">{variants[index]!.name}</span>
      <Button variant="ghost" size="icon-sm" className="rounded-full text-white hover:bg-white/10" aria-label="Next variant" onClick={() => step(1)}>
        <ChevronRight />
      </Button>
    </div>
  );
}

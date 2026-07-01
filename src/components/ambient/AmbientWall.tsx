"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { X } from "lucide-react";

import type { AmbientTile } from "@/lib/ambient/ambient-tiles";

/**
 * Self-contained keyframes: a very slow pan + breathing zoom that *alternates*
 * (drifts out and eases back forever), so there is no scroll seam to align. The
 * grid is over-scanned (scale > 1) so the pan never reveals the background on a
 * full wall. Injected locally rather than into globals.css to keep the diff
 * self-contained. Reduced-motion holds it still (with a hair of over-scan so no
 * edge slivers show).
 */
const AMBIENT_CSS = `
@keyframes ks-ambient-pan {
  from { transform: translate3d(2%, 1%, 0) scale(1.08); }
  to   { transform: translate3d(-3%, -6%, 0) scale(1.16); }
}
.ks-ambient-pan {
  animation: ks-ambient-pan 64s ease-in-out infinite alternate;
  will-change: transform;
}
@media (prefers-reduced-motion: reduce) {
  .ks-ambient-pan { animation: none; transform: scale(1.02); }
}
`;

export function AmbientWall({ tiles }: { tiles: AmbientTile[] }) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") router.push("/library");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      <style dangerouslySetInnerHTML={{ __html: AMBIENT_CSS }} />

      {/* Decorative mosaic; over-scanned and slowly breathing. */}
      <div
        aria-hidden="true"
        className="ks-ambient-pan grid h-full w-full grid-cols-3 place-content-center gap-1.5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
      >
        {tiles.map((tile) => (
          <div
            key={tile.id}
            className="relative aspect-[2/3] overflow-hidden rounded-[3px]"
            style={tile.color ? { backgroundColor: tile.color } : undefined}
          >
            {tile.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy (matches ItemCard).
              <img
                src={tile.src}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : null}
          </div>
        ))}
      </div>

      {/* Soft vignette for depth + so the exit control stays legible over bright covers. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 45%, transparent 55%, color-mix(in oklab, var(--background) 78%, transparent) 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent"
      />

      <Link
        href="/library"
        aria-label="Exit ambient mode"
        className="ks-pointer-coarse-min-hit absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-2 text-sm font-medium text-white/90 backdrop-blur transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <X className="size-4" aria-hidden="true" />
        Exit
      </Link>
    </div>
  );
}

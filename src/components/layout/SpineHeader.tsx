"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { ThequeLogo } from "@/components/brand/ThequeLogo";
import { HEADER_HEIGHT, SPINE_EDGE_HEIGHT, spineEdgeGradient } from "@/components/layout/spine-edge";
import { useSpineColors } from "@/hooks/useSpineColors";

/**
 * The library's spines along the bottom of the header, full width. The spines
 * sweep in from the left one time, when the colors load. A keyline shows
 * before that, and stays when the library has too few colors.
 */
function SpineEdge() {
  const colors = useSpineColors();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gradient = spineEdgeGradient(colors, width);
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-x-0 bottom-0"
      style={{ height: SPINE_EDGE_HEIGHT }}
      aria-hidden="true"
    >
      <div className="absolute inset-x-0 bottom-0 h-px bg-border" />
      {gradient ? (
        <div
          className="ks-spine-sweep-in absolute inset-0"
          style={{ backgroundImage: gradient, filter: "saturate(0.66)" }}
        />
      ) : null}
    </div>
  );
}

/**
 * App header: the wordmark in the center and the trailing control at the
 * right, over an edge of the library's spines (ADR 0019).
 */
export function SpineHeader({ trailing }: { trailing: React.ReactNode }) {
  return (
    // No view-transition-name on the header itself: it would make the header a
    // backdrop root, and the surface could not blur the page under it.
    <header className="sticky top-0 z-20 h-14">
      <div
        className="pointer-events-none absolute inset-0 bg-background/90 backdrop-blur"
        aria-hidden="true"
      />
      <SpineEdge />

      {/* The content centers in the space above the spine edge. */}
      <div
        className="relative mx-auto flex w-full max-w-6xl items-center justify-end px-4"
        style={{ height: HEADER_HEIGHT - SPINE_EDGE_HEIGHT, viewTransitionName: "app-header" }}
      >
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <ThequeLogo size="md" href="/library" />
        </span>
        {trailing}
      </div>
    </header>
  );
}

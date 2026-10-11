"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ThequeLogo } from "@/components/brand/ThequeLogo";
import {
  HEADER_HEIGHT,
  NOTCH_DROP,
  NOTCH_PADDING,
  SPINE_PX,
  SPINE_STROKE,
  notchGeometry,
} from "@/components/layout/notch-geometry";
import { sampleEvenly } from "@/components/library/LibrarySpineBand";
import { useSpineColors } from "@/hooks/useSpineColors";

/** Below this many colors, spines look broken; the outline stays plain. */
const MIN_SPINES = 8;

/**
 * The library's spines drawn along the notch outline. Each spine is one dash
 * of the same path, so the colors follow the corners. A keyline under the
 * spines keeps dark spines visible in dark mode and light spines visible in
 * light mode.
 */
function SpineOutline({ d, height, width }: { d: string; height: number; width: number }) {
  const colors = useSpineColors();
  const measureRef = useRef<SVGPathElement>(null);
  const [length, setLength] = useState(0);
  const maskId = useId();

  useLayoutEffect(() => {
    setLength(measureRef.current?.getTotalLength() ?? 0);
  }, [d]);

  const spines = useMemo(() => {
    if (length <= 0 || colors.length < MIN_SPINES) return [];
    return sampleEvenly(colors, Math.max(MIN_SPINES, Math.round(length / SPINE_PX)));
  }, [colors, length]);
  const seg = spines.length ? length / spines.length : 0;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      width={width}
      height={height}
      aria-hidden="true"
    >
      <path ref={measureRef} d={d} fill="none" stroke="none" />
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={spines.length ? SPINE_STROKE + 2 : 1}
        className="text-foreground/20"
      />
      {spines.length ? (
        <>
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse">
              <path
                d={d}
                fill="none"
                stroke="white"
                strokeWidth={SPINE_STROKE + 2}
                className="ks-spine-draw-in"
                style={{ strokeDasharray: length, ["--ks-spine-length" as string]: length }}
              />
            </mask>
          </defs>
          <g mask={`url(#${maskId})`} style={{ filter: "saturate(0.66)" }}>
            {spines.map((color, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={SPINE_STROKE}
                // Each dash overlaps the next by 0.6px so no seam shows.
                strokeDasharray={`${seg + 0.6} ${length}`}
                strokeDashoffset={-i * seg}
              />
            ))}
          </g>
        </>
      ) : null}
    </svg>
  );
}

/**
 * App header with a MacBook-style notch. The wordmark sits in a centered tab
 * that hangs below the bar. The library's spines outline the tab's sides and
 * bottom (ADR 0019).
 */
export function NotchHeader({ trailing }: { trailing: React.ReactNode }) {
  const headerRef = useRef<HTMLElement>(null);
  const logoRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  const [logoWidth, setLogoWidth] = useState(0);

  useLayoutEffect(() => {
    const header = headerRef.current;
    const logo = logoRef.current;
    if (!header || !logo) return;
    const measure = () => {
      setWidth(header.clientWidth);
      setLogoWidth(logo.getBoundingClientRect().width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    ro.observe(logo);
    return () => ro.disconnect();
  }, []);

  const geo = width > 0 && logoWidth > 0 ? notchGeometry(width, logoWidth + NOTCH_PADDING) : null;
  const notchHeight = HEADER_HEIGHT + NOTCH_DROP;

  return (
    // No view-transition-name on the header itself: it would make the header a
    // backdrop root, and the clipped surface could not blur the page under it.
    <header ref={headerRef} className="sticky top-0 z-20 h-14">
      {geo ? (
        <>
          {/* The header surface, clipped to the notch so the blur follows it. */}
          <div
            className="pointer-events-none absolute left-0 top-0 bg-background/90 backdrop-blur"
            style={{ width, height: geo.height, clipPath: `path("${geo.fill}")` }}
            aria-hidden="true"
          />
          <SpineOutline d={geo.stroke} height={geo.height} width={width} />
        </>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-background/90" aria-hidden="true" />
      )}

      <div
        className="relative mx-auto flex h-14 w-full max-w-6xl items-center justify-end px-4"
        style={{ viewTransitionName: "app-header" }}
      >
        <span
          ref={logoRef}
          className="absolute left-1/2 -translate-x-1/2"
          style={{ top: notchHeight / 2 - 14 }}
        >
          <ThequeLogo size="md" href="/library" />
        </span>
        {trailing}
      </div>
    </header>
  );
}

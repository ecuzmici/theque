"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SlideKind, Wrapped } from "@/lib/wrapped/wrapped";

import { SlideBody } from "./WrappedSlides";

type WrappedStoryProps = {
  wrapped: Wrapped;
  slides: SlideKind[];
  /** The years to show in the year switch, newest first. */
  years: number[];
  currentYear: number;
};

const CLOSE_HREF = "/library";
/** A horizontal move longer than this is a swipe, not a tap. */
const SWIPE_PX = 40;

function yearHref(year: number, currentYear: number): string {
  return year === currentYear ? "/wrapped" : `/wrapped?year=${year}`;
}

/**
 * A soft glow from one cover colour of the year at the top of each slide.
 * The slides walk through the palette, so the story changes colour as you go.
 */
function slideBackground(colors: string[], index: number, count: number): string {
  const base = "#0c0a09";
  if (colors.length === 0) return `radial-gradient(120% 70% at 50% 0%, rgba(180, 83, 9, 0.45), ${base} 70%)`;
  const color = colors[Math.floor((index / Math.max(1, count)) * colors.length)] ?? colors[0]!;
  return `radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, ${color} 60%, transparent), ${base} 72%)`;
}

/**
 * The story player for /wrapped. Arrow keys, tap zones and swipes move
 * between slides. The progress row shows where you are. The player does not
 * move on by itself, so each slide stays until you go on.
 */
export function WrappedStory({ wrapped, slides, years, currentYear }: WrappedStoryProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const last = slides.length - 1;
  const go = useCallback((delta: number) => setIndex((i) => Math.min(last, Math.max(0, i + delta))), [last]);

  useEffect(() => {
    frameRef.current?.focus({ preventScroll: true });
  }, []);

  // The story is modal: the app shell behind it is inert and the page does not scroll.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const madeInert: HTMLElement[] = [];
    for (let node: HTMLElement | null = overlay; node && node !== document.body; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement?.children ?? [])) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true;
          madeInert.push(sibling);
        }
      }
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      for (const el of madeInert) el.inert = false;
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        router.push(CLOSE_HREF);
        return;
      }
      // Keys in the year switch or in a form field keep their own meaning.
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("nav, a, input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Home") setIndex(0);
      else if (e.key === "End") setIndex(last);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, last, router]);

  function onPointerDown(e: React.PointerEvent) {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
  }

  function onPointerUp(e: React.PointerEvent) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true;
      go(dx < 0 ? 1 : -1);
    }
  }

  function tap(delta: number) {
    if (swiped.current) return;
    go(delta);
  }

  const kind = slides[index]!;
  const label = wrapped.partial ? `Your ${wrapped.year} so far` : `Your ${wrapped.year}`;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center gap-6 bg-[#0c0a09] text-white lg:p-6">
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label="Previous slide"
        disabled={index === 0}
        onClick={() => go(-1)}
        className="hidden rounded-full text-white hover:bg-white/10 hover:text-white lg:inline-flex dark:hover:bg-white/10"
      >
        <ChevronLeft className="size-6" />
      </Button>

      <section
        ref={frameRef}
        tabIndex={-1}
        aria-roledescription="carousel"
        aria-label="Slides"
        className="relative flex h-full w-full flex-col overflow-hidden outline-none lg:aspect-[9/16] lg:h-[min(100%,52rem)] lg:w-auto lg:rounded-3xl lg:shadow-2xl lg:ring-1 lg:ring-white/10"
        style={{ background: slideBackground(wrapped.palette.colors, index, slides.length) }}
      >
        <header className="relative z-30 flex flex-col gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <ol className="flex gap-1" aria-label={`Slide ${index + 1} of ${slides.length}`}>
            {slides.map((s, i) => (
              <li key={s} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-white" : "bg-white/25")} />
            ))}
          </ol>
          <div className="flex items-center justify-between gap-2">
            <nav aria-label="Year" className="flex min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none]">
              {years.map((year) => {
                const active = year === wrapped.year;
                return (
                  <Button
                    key={year}
                    variant="ghost"
                    nativeButton={false}
                    render={<Link href={yearHref(year, currentYear)} />}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "rounded-full border px-3 tabular-nums focus-visible:ring-white/60",
                      active
                        ? "border-white bg-white text-[#0c0a09] hover:bg-white hover:text-[#0c0a09] dark:hover:bg-white"
                        : "border-white/25 text-white/75 hover:border-white/50 hover:bg-transparent hover:text-white dark:hover:bg-transparent",
                    )}
                  >
                    {year}
                  </Button>
                );
              })}
            </nav>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Close"
              nativeButton={false}
              render={<Link href={CLOSE_HREF} />}
              className="-mr-1.5 shrink-0 rounded-full text-white hover:bg-white/10 hover:text-white dark:hover:bg-white/10"
            >
              <X className="size-5" />
            </Button>
          </div>
        </header>

        <div
          className="relative min-h-0 flex-1 touch-pan-y select-none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (pointerStart.current = null)}
        >
          <button
            type="button"
            aria-label="Previous slide"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-w-resize outline-none"
            onClick={() => tap(-1)}
          />
          <button
            type="button"
            aria-label="Next slide"
            tabIndex={-1}
            className="absolute inset-y-0 right-0 z-10 w-2/3 cursor-e-resize outline-none"
            onClick={() => tap(1)}
          />
          {/* The live region stays mounted, so a screen reader reads each new slide. */}
          <div aria-live="polite" className="pointer-events-none absolute inset-0 z-20">
            <div
              key={index}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${slides.length}`}
              className="wrapped-rise mx-auto flex h-full w-full max-w-md flex-col justify-center gap-4 overflow-hidden px-6 pb-[max(2rem,env(safe-area-inset-bottom))] [container-type:size] [&_a]:pointer-events-auto [&_button]:pointer-events-auto"
            >
              <SlideBody kind={kind} wrapped={wrapped} actions={{ onRestart: () => setIndex(0), closeHref: CLOSE_HREF }} />
            </div>
          </div>
        </div>
      </section>

      <Button
        variant="ghost"
        size="icon-lg"
        aria-label="Next slide"
        disabled={index === last}
        onClick={() => go(1)}
        className="hidden rounded-full text-white hover:bg-white/10 hover:text-white lg:inline-flex dark:hover:bg-white/10"
      >
        <ChevronRight className="size-6" />
      </Button>

      <style>{`
        @keyframes wrapped-rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: no-preference) {
          .wrapped-rise { animation: wrapped-rise 450ms ease-out; }
        }
      `}</style>
    </div>
  );
}

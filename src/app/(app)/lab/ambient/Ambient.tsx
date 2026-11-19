"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { hashString } from "../lab-color";
import type { LabItem } from "../lab-data";

const COLUMNS = 7;
const SPOTLIGHT_MS = 9000;

/** Each column holds every 7th cover twice, so its scroll loops without a seam. */
function columnsOf(items: LabItem[]): LabItem[][] {
  const shuffled = [...items].sort((a, b) => hashString(a.id) - hashString(b.id));
  return Array.from({ length: COLUMNS }, (_, c) => {
    const column = shuffled.filter((_, i) => i % COLUMNS === c);
    return [...column, ...column];
  });
}

export function Ambient({ items }: { items: LabItem[] }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const columns = useMemo(() => columnsOf(items), [items]);
  const favourites = useMemo(() => items.filter((i) => (i.rating ?? 0) >= 4), [items]);
  const [spot, setSpot] = useState(0);

  useEffect(() => {
    if (favourites.length === 0) return;
    const timer = setInterval(() => setSpot((s) => (s + 1) % favourites.length), SPOTLIGHT_MS);
    return () => clearInterval(timer);
  }, [favourites.length]);

  const featured = favourites[spot];

  return (
    <div className="space-y-3">
      <div ref={stageRef} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <div className="absolute inset-0 flex gap-3 px-3 opacity-80">
          {columns.map((column, c) => (
            <div
              key={c}
              className="flex flex-1 flex-col gap-3"
              style={{
                animation: `lab-drift ${90 + (c % 3) * 25}s linear infinite`,
                animationDirection: c % 2 ? "reverse" : "normal",
              }}
            >
              {column.map((item, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- prototype; cached cover URL
                <img
                  key={`${item.id}-${i}`}
                  src={item.coverFull!}
                  alt=""
                  loading="lazy"
                  className="aspect-[2/3] w-full rounded-md object-cover shadow-lg"
                />
              ))}
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.85)_100%)]" />
        {featured ? (
          <div key={featured.id} className="absolute inset-x-0 bottom-0 p-6 text-white [animation:lab-fade_1.2s_ease-out] sm:p-10">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">From your shelves</p>
            <p className="mt-2 font-heading text-3xl leading-tight sm:text-5xl">{featured.title}</p>
            <p className="mt-1 text-sm opacity-70">
              {featured.authors[0] ?? featured.directors[0] ?? ""} <span className="text-amber-400">{"★".repeat(featured.rating ?? 0)}</span>
            </p>
            {featured.verdict ? (
              <p className="mt-3 max-w-2xl font-serif text-lg leading-snug italic opacity-90 sm:text-xl">“{featured.verdict}”</p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => void stageRef.current?.requestFullscreen?.()}>
          Full screen
        </Button>
      </div>
      <style>{`
        @keyframes lab-drift { from { transform: translateY(0) } to { transform: translateY(-50%) } }
        @keyframes lab-fade { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) { [style*="lab-drift"] { animation: none !important } }
      `}</style>
    </div>
  );
}

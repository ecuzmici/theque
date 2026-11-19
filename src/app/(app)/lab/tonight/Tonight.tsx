"use client";

import { Link } from "next-view-transitions";
import { useEffect, useMemo, useState } from "react";

import { CoverImg } from "@/components/items/CoverImg";
import { Button } from "@/components/ui/button";
import { MOODS } from "@/lib/taste/taste-lists";
import { cn } from "@/lib/utils";

import { hashString } from "../lab-color";
import type { LabItem } from "../lab-data";
import type { RegionProviders } from "../lab-tmdb";

type Slot = {
  id: string;
  label: string;
  hint: string;
  fits: (item: LabItem, kind: "movie" | "tv" | undefined) => boolean;
};

const SLOTS: Slot[] = [
  { id: "short", label: "Under 100 min", hint: "A short film", fits: (i, k) => i.category === "movies_and_tv" && k !== "tv" && (i.runtime ?? 999) <= 100 },
  { id: "film", label: "About two hours", hint: "A regular film", fits: (i, k) => i.category === "movies_and_tv" && k !== "tv" && (i.runtime ?? 120) <= 135 },
  { id: "long", label: "A long night", hint: "Any film", fits: (i, k) => i.category === "movies_and_tv" && k !== "tv" },
  { id: "series", label: "Start a series", hint: "TV", fits: (i, k) => i.category === "movies_and_tv" && k === "tv" },
  { id: "weekend", label: "A weekend of reading", hint: "Up to 350 pages", fits: (i) => i.category === "books" && (i.pages ?? 400) <= 350 },
  { id: "week", label: "A week of reading", hint: "Up to 600 pages", fits: (i) => i.category === "books" && (i.pages ?? 500) <= 600 },
];

const MOOD_LABEL = new Map<string, string>(MOODS.map((m) => [m.key, m.label]));

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function formatRuntime(minutes: number | null): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m ? `${m} m` : ""}`.trim() : `${m} m`;
}

export function Tonight({
  items,
  providers,
  kinds,
  regions,
  now,
}: {
  now: number;
  items: LabItem[];
  providers: Record<string, Record<string, RegionProviders>>;
  kinds: Record<string, "movie" | "tv">;
  regions: string[];
}) {
  const [slot, setSlot] = useState<Slot>(SLOTS[1]!);
  const [mood, setMood] = useState<string | null>(null);
  const [region, setRegion] = useState("NL");
  const [mine, setMine] = useState<string[]>([]);
  const [spin, setSpin] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is read after mount so hydration stays clean
    setRegion(readStored("theque-lab-region", "NL"));
    setMine(readStored<string[]>("theque-lab-services", []));
  }, []);

  const services = useMemo(() => {
    const counts = new Map<string, number>();
    for (const byRegion of Object.values(providers)) {
      for (const name of byRegion[region]?.stream ?? []) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 12);
  }, [providers, region]);

  const moods = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) if (slot.fits(item, kinds[item.id])) for (const m of item.moods) counts.set(m, (counts.get(m) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m]) => m);
  }, [items, kinds, slot]);

  const ranked = useMemo(() => {
    return items
      .filter((item) => slot.fits(item, kinds[item.id]))
      .filter((item) => !mood || item.moods.includes(mood))
      .map((item) => {
        const here = providers[item.id]?.[region];
        const onMine = here?.stream.some((s) => mine.includes(s)) ?? false;
        const waitingDays = (now - Date.parse(item.createdAt)) / 86_400_000;
        let score = waitingDays / 60;
        if (item.category === "movies_and_tv") score += onMine ? 6 : here?.stream.length ? 2 : 0;
        if (item.category === "books" && item.hasFile) score += 4; // already on the Kobo
        score += (hashString(`${item.id}-${spin}`) % 100) / 40; // the shuffle
        return { item, score, here, onMine };
      })
      .sort((a, b) => b.score - a.score);
  }, [items, kinds, mine, mood, now, providers, region, slot, spin]);

  const pick = ranked[0];
  const toggleService = (name: string) => {
    const next = mine.includes(name) ? mine.filter((s) => s !== name) : [...mine, name];
    setMine(next);
    writeStored("theque-lab-services", next);
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="time">
        <h2 id="time" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          How much time do you have?
        </h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SLOTS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSlot(s);
                setMood(null);
              }}
              className={cn(
                "min-h-10 rounded-full border px-3.5 text-sm",
                slot.id === s.id ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {moods.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">In the mood for</span>
            {moods.map((m) => (
              <button
                key={m}
                onClick={() => setMood(mood === m ? null : m)}
                className={cn("min-h-8 rounded-full border px-2.5 text-xs", mood === m ? "border-amber-400 bg-amber-400/15" : "border-border text-muted-foreground")}
              >
                {MOOD_LABEL.get(m) ?? m}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {slot.id !== "weekend" && slot.id !== "week" ? (
        <section aria-labelledby="services" className="rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="services" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Your services
            </h2>
            <select
              aria-label="Region"
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                writeStored("theque-lab-region", e.target.value);
              }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              {regions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {services.map((name) => (
              <button
                key={name}
                aria-pressed={mine.includes(name)}
                onClick={() => toggleService(name)}
                className={cn("min-h-8 rounded-full border px-2.5 text-xs", mine.includes(name) ? "border-sky-400 bg-sky-400/15" : "border-border text-muted-foreground")}
              >
                {name}
              </button>
            ))}
            {services.length === 0 ? <p className="text-xs text-muted-foreground">No streaming data for this region.</p> : null}
          </div>
        </section>
      ) : null}

      {pick ? (
        <section aria-live="polite" className="overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
            <div className="mx-auto aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/10 sm:mx-0 sm:w-48" style={{ background: pick.item.color ?? "#444" }}>
              {pick.item.cover ? <CoverImg urls={pick.item.cover} className="size-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Tonight</p>
              <h2 className="mt-1 font-heading text-3xl leading-tight tracking-tight">{pick.item.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {[pick.item.directors[0] ?? pick.item.authors[0], pick.item.year, formatRuntime(pick.item.runtime), pick.item.pages ? `${pick.item.pages} pages` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {pick.item.category === "books" && pick.item.hasFile ? (
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-600 dark:text-emerald-400">Already on your Kobo</span>
                ) : null}
                {pick.here?.stream.map((s) => (
                  <span key={s} className={cn("rounded-full px-2.5 py-1 text-xs", mine.includes(s) ? "bg-sky-500/20 text-sky-700 dark:text-sky-300" : "bg-muted text-muted-foreground")}>
                    {mine.includes(s) ? `On your ${s}` : `On ${s}`}
                  </span>
                ))}
                {pick.item.category === "movies_and_tv" && !pick.here?.stream.length && pick.here?.rent.length ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Rent on {pick.here.rent.slice(0, 2).join(" or ")}</span>
                ) : null}
                {pick.item.category === "movies_and_tv" && !pick.here ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Not streaming in {region}</span>
                ) : null}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                On your list for {Math.round((now - Date.parse(pick.item.createdAt)) / 86_400_000)} days.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button onClick={() => setSpin((s) => s + 1)}>Something else</Button>
                <Button variant="outline" nativeButton={false} render={<Link href={`/item/${pick.item.id}`} />}>
                  Open
                </Button>
                {pick.here?.link ? (
                  <Button variant="ghost" nativeButton={false} render={<a href={pick.here.link} target="_blank" rel="noopener noreferrer" />}>
                    Where to watch ↗
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          {ranked.length > 1 ? (
            <div className="border-t border-border bg-muted/30 px-5 py-4 sm:px-6">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Also fits · {ranked.length - 1} more</p>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                {ranked.slice(1, 9).map(({ item, onMine }) => (
                  <Link key={item.id} href={`/item/${item.id}`} className="w-20 shrink-0">
                    <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-muted shadow">
                      {item.cover ? <CoverImg urls={item.cover} className="size-full object-cover" /> : null}
                      {onMine ? <span className="absolute right-1 bottom-1 size-2 rounded-full bg-sky-400 ring-2 ring-black/30" /> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-tight">{item.title}</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="rounded-2xl border border-border p-5 text-sm text-muted-foreground">Nothing on your list fits that. Try more time.</p>
      )}
      <p className="text-[11px] text-muted-foreground">Streaming data: TMDB and JustWatch. Updated once a day.</p>
    </div>
  );
}

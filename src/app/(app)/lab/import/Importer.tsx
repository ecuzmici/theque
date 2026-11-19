"use client";

import { Link } from "next-view-transitions";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { normalizeIsbn } from "@/lib/isbn";
import { cn } from "@/lib/utils";

import type { LabItem } from "../lab-data";

type LibraryEntry = Pick<LabItem, "id" | "title" | "authors" | "isbn" | "year" | "category" | "status">;

type Row = {
  title: string;
  creator: string;
  year: number | null;
  isbn: string | null;
  rating: number | null;
  finishedAt: string | null;
  shelf: "done" | "want" | "reading";
};

type Parsed = { source: "goodreads" | "letterboxd"; rows: Row[] };

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, newlines in quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

function parseExport(text: string, fileName: string): Parsed | null {
  const [header, ...body] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) return null;
  const col = (name: string) => header.indexOf(name);
  const get = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? "").trim() : "");

  if (col("Exclusive Shelf") >= 0 && col("Title") >= 0) {
    return {
      source: "goodreads",
      rows: body.map((r) => {
        const shelf = get(r, "Exclusive Shelf");
        const rating = Number(get(r, "My Rating"));
        const isbnRaw = get(r, "ISBN13").replace(/[="]/g, "") || get(r, "ISBN").replace(/[="]/g, "");
        return {
          title: get(r, "Title").replace(/\s*\([^()]*#[\d.]+\)\s*$/, ""),
          creator: get(r, "Author"),
          year: Number(get(r, "Original Publication Year") || get(r, "Year Published")) || null,
          isbn: normalizeIsbn(isbnRaw),
          rating: rating > 0 ? rating : null,
          finishedAt: get(r, "Date Read").replace(/\//g, "-") || null,
          shelf: shelf === "read" ? "done" : shelf === "currently-reading" ? "reading" : "want",
        };
      }),
    };
  }
  if (col("Letterboxd URI") >= 0 && col("Name") >= 0) {
    const isWatchlist = /watchlist/i.test(fileName);
    return {
      source: "letterboxd",
      rows: body.map((r) => {
        const rating = Number(get(r, "Rating"));
        return {
          title: get(r, "Name"),
          creator: "",
          year: Number(get(r, "Year")) || null,
          isbn: null,
          rating: rating > 0 ? Math.round(rating) : null,
          finishedAt: get(r, "Watched Date") || (isWatchlist ? null : get(r, "Date")) || null,
          shelf: isWatchlist ? "want" : "done",
        };
      }),
    };
  }
  return null;
}

function norm(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

const SAMPLE = `Book Id,Title,Author,ISBN13,My Rating,Original Publication Year,Date Read,Exclusive Shelf
1,"Dune (Dune, #1)",Frank Herbert,"=""9780441013593""",5,1965,2019/03/02,read
2,The Left Hand of Darkness,Ursula K. Le Guin,"=""9780441007318""",4,1969,2020/07/11,read
3,Hyperion (Hyperion Cantos #1),Dan Simmons,"=""9780553283686""",5,1989,2021/01/20,read
4,Children of Time,Adrian Tchaikovsky,"=""9781447273318""",5,2015,2022/05/30,read
5,The Road,Cormac McCarthy,"=""9780307387899""",3,2006,2018/10/04,read
6,Blindsight,Peter Watts,"=""9780765319647""",0,2006,,to-read
7,Gideon the Ninth,Tamsyn Muir,"=""9781250313188""",2,2019,2021/09/14,read
8,Anathem,Neal Stephenson,"=""9780061474101""",0,2008,,currently-reading`;

export function Importer({ library }: { library: LibraryEntry[] }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSample, setIsSample] = useState(false);

  const load = (text: string, name: string, sample = false) => {
    const result = parseExport(text, name);
    if (!result) {
      setError("That file is not a Goodreads or Letterboxd export.");
      setParsed(null);
      return;
    }
    setError(null);
    setIsSample(sample);
    setParsed(result);
  };

  const matched = useMemo(() => {
    if (!parsed) return [];
    const kind = parsed.source === "goodreads" ? "books" : "movies_and_tv";
    const pool = library.filter((l) => l.category === kind);
    return parsed.rows.map((row) => {
      const byIsbn = row.isbn ? pool.find((l) => l.isbn && normalizeIsbn(l.isbn) === row.isbn) : undefined;
      const byTitle = pool.find(
        (l) => norm(l.title.split(":")[0]!) === norm(row.title.split(":")[0]!) && (!row.year || !l.year || Math.abs(l.year - row.year) <= 1 || kind === "books"),
      );
      return { row, match: byIsbn ?? byTitle ?? null };
    });
  }, [parsed, library]);

  const fresh = matched.filter((m) => !m.match);
  const finishedNew = fresh.filter((m) => m.row.shelf === "done");
  const ratedNew = finishedNew.filter((m) => m.row.rating);
  const loved = ratedNew.filter((m) => (m.row.rating ?? 0) >= 4);
  const histogram = [5, 4, 3, 2, 1].map((star) => ({ star, count: matched.filter((m) => m.row.rating === star).length }));
  const maxCount = Math.max(1, ...histogram.map((h) => h.count));
  const years = finishedNew.map((m) => m.row.finishedAt?.slice(0, 4)).filter(Boolean) as string[];
  const firstYear = years.length ? years.sort()[0] : null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-dashed border-border p-6 text-center">
        <p className="font-heading text-xl">Drop an export here</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Goodreads: My Books → Import and export → Export library. Letterboxd: Settings → Data → Export your data, then pick
          ratings.csv, diary.csv, or watchlist.csv.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            Choose CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) load(await file.text(), file.name);
              }}
            />
          </label>
          <Button variant="outline" onClick={() => load(SAMPLE, "goodreads_library_export.csv", true)}>
            Try a sample
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">The file stays in this browser. Nothing is saved.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {parsed ? (
        <>
          {isSample ? <p className="text-xs text-amber-600 dark:text-amber-400">Sample data, not your history.</p> : null}
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Rows", parsed.rows.length],
              ["Already in thèque", matched.length - fresh.length],
              [parsed.source === "goodreads" ? "Finished, new" : "Watched, new", finishedNew.length],
              ["New 4-5 star loves", loved.length],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-2xl border border-border bg-card/60 p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 font-heading text-3xl tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 sm:grid-cols-[1fr_1.4fr]">
            <section className="rounded-2xl border border-border p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your ratings there</h2>
              <div className="mt-3 space-y-1.5">
                {histogram.map((h) => (
                  <div key={h.star} className="flex items-center gap-2 text-xs">
                    <span className="w-14 text-amber-500">{"★".repeat(h.star)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${(h.count / maxCount) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right tabular-nums text-muted-foreground">{h.count}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-border p-4 text-sm leading-relaxed">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What the import would do</h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5">
                <li>
                  Add {finishedNew.length} finished {parsed.source === "goodreads" ? "books" : "films"} with their done dates
                  {firstYear ? `, going back to ${firstYear}` : ""}. Your diary and recap gain that history.
                </li>
                <li>Give the recommender {loved.length} more loves and {ratedNew.length - loved.length} more misses to learn from.</li>
                <li>
                  Put {fresh.filter((m) => m.row.shelf !== "done").length} unread titles on Want, with the
                  {parsed.source === "goodreads" ? " ISBN, so the Goodreads link opens the right page" : " Letterboxd year"}.
                </li>
                <li>Leave the {matched.length - fresh.length} titles you already have untouched.</li>
              </ul>
            </section>
          </div>

          <section>
            <h2 className="font-heading text-xl tracking-tight">Preview</h2>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Rating</th>
                    <th className="px-3 py-2 font-medium">Finished</th>
                    <th className="px-3 py-2 font-medium">In thèque</th>
                  </tr>
                </thead>
                <tbody>
                  {matched.slice(0, 60).map(({ row, match }, i) => (
                    <tr key={i} className={cn("border-t border-border", match ? "opacity-60" : "")}>
                      <td className="px-3 py-2">
                        <span className="font-medium">{row.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[row.creator, row.year].filter(Boolean).join(" · ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-amber-500">{row.rating ? "★".repeat(row.rating) : ""}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.finishedAt ?? (row.shelf === "reading" ? "reading" : "—")}</td>
                      <td className="px-3 py-2">
                        {match ? (
                          <Link href={`/item/${match.id}`} className="text-xs underline underline-offset-4">
                            Yes
                          </Link>
                        ) : (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">New</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

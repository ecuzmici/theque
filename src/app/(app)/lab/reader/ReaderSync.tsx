"use client";

import { Link } from "next-view-transitions";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { LabItem } from "../lab-data";

type Book = Pick<LabItem, "id" | "title" | "authors" | "status" | "doneAt" | "cover" | "hasFile">;

type DeviceBook = {
  key: string;
  title: string;
  author: string;
  state: "finished" | "reading" | "unread";
  percent: number;
  lastRead: string | null;
  secondsRead: number;
};

type Highlight = { bookKey: string; title: string; author: string; text: string; note: string | null; date: string | null };

type Parsed = { source: "kobo" | "kindle"; books: DeviceBook[]; highlights: Highlight[] };

/** sql.js 1.12.0, vendored under public/ because the CSP blocks third-party scripts. */
const SQL_JS = "/lab/sqljs";

function norm(text: string): string {
  return text
    .split(/\s*[:([]/)[0]!
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type SqlJs = {
  Database: new (data: Uint8Array) => { exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>; close: () => void };
};

async function loadSqlJs(): Promise<SqlJs> {
  const w = window as unknown as { initSqlJs?: (config: { locateFile: (f: string) => string }) => Promise<SqlJs> };
  if (!w.initSqlJs) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${SQL_JS}/sql-wasm.js`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load the SQLite reader."));
      document.head.append(script);
    });
  }
  return w.initSqlJs!({ locateFile: (file) => `${SQL_JS}/${file}` });
}

function rows(result: Array<{ columns: string[]; values: unknown[][] }>): Array<Record<string, unknown>> {
  const first = result[0];
  if (!first) return [];
  return first.values.map((values) => Object.fromEntries(first.columns.map((c, i) => [c, values[i]])));
}

/** KoboReader.sqlite: `content` rows of type 6 are books; `Bookmark` rows are highlights. */
async function parseKobo(file: File): Promise<Parsed> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  try {
    const books = rows(
      db.exec(
        "SELECT ContentID, Title, Attribution, ReadStatus, ___PercentRead AS pct, DateLastRead, TimeSpentReading FROM content WHERE ContentType = 6",
      ),
    ).map((r) => ({
      key: String(r.ContentID),
      title: String(r.Title ?? "Untitled"),
      author: String(r.Attribution ?? ""),
      state: (r.ReadStatus === 2 ? "finished" : r.ReadStatus === 1 ? "reading" : "unread") as DeviceBook["state"],
      percent: Number(r.pct ?? 0),
      lastRead: r.DateLastRead ? String(r.DateLastRead) : null,
      secondsRead: Number(r.TimeSpentReading ?? 0),
    }));
    const byKey = new Map(books.map((b) => [b.key, b]));
    const highlights = rows(
      db.exec("SELECT VolumeID, Text, Annotation, DateCreated FROM Bookmark WHERE Text IS NOT NULL AND trim(Text) <> '' ORDER BY DateCreated"),
    ).map((r) => {
      const book = byKey.get(String(r.VolumeID));
      return {
        bookKey: String(r.VolumeID),
        title: book?.title ?? "Unknown book",
        author: book?.author ?? "",
        text: String(r.Text).trim(),
        note: r.Annotation ? String(r.Annotation) : null,
        date: r.DateCreated ? String(r.DateCreated) : null,
      };
    });
    return { source: "kobo", books, highlights };
  } finally {
    db.close();
  }
}

/** My Clippings.txt: entries split by "==========", title line "Title (Author)". */
function parseKindle(text: string): Parsed {
  const highlights: Highlight[] = [];
  for (const block of text.replace(/^﻿/, "").split(/\r?\n==========\r?\n?/)) {
    const lines = block.split(/\r?\n/).map((l) => l.replace(/^﻿/, "").trim());
    const head = lines[0];
    const meta = lines[1] ?? "";
    const body = lines.slice(2).join(" ").trim();
    if (!head || !body || !/highlight/i.test(meta)) continue;
    const m = head.match(/^(.*)\(([^()]*)\)\s*$/);
    const title = (m ? m[1]! : head).trim();
    const author = (m ? m[2]! : "").trim();
    highlights.push({
      bookKey: `${title}|${author}`,
      title,
      author,
      text: body,
      note: null,
      date: meta.split("Added on")[1]?.trim() ?? null,
    });
  }
  const books = [...new Map(highlights.map((h) => [h.bookKey, h])).values()].map((h) => ({
    key: h.bookKey,
    title: h.title,
    author: h.author,
    state: "unread" as const,
    percent: 0,
    lastRead: null,
    secondsRead: 0,
  }));
  return { source: "kindle", books, highlights };
}

const SAMPLE_CLIPPINGS = `Frankenstein (Mary Shelley)
- Your Highlight on page 24 | location 360-361 | Added on Monday, 3 March 2025 22:10:04

Nothing is so painful to the human mind as a great and sudden change.
==========
Frankenstein (Mary Shelley)
- Your Highlight on page 61 | location 930-931 | Added on Tuesday, 4 March 2025 21:44:51

Beware; for I am fearless, and therefore powerful.
==========
The Time Machine (H. G. Wells)
- Your Highlight on page 12 | location 160-162 | Added on Saturday, 12 April 2025 10:02:11

It is a law of nature we overlook, that intellectual versatility is the compensation for change, danger, and trouble.
==========
`;

function hours(seconds: number): string {
  const h = seconds / 3600;
  return h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1)} h`;
}

export function ReaderSync({ books }: { books: Book[] }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [openBook, setOpenBook] = useState<string | null>(null);

  const library = useMemo(() => new Map(books.map((b) => [norm(b.title), b])), [books]);

  const load = async (file: File) => {
    setBusy(true);
    setError(null);
    setIsSample(false);
    try {
      if (/\.(sqlite|db)$/i.test(file.name)) setParsed(await parseKobo(file));
      else setParsed(parseKindle(await file.text()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
      setParsed(null);
    } finally {
      setBusy(false);
    }
  };

  const matched = useMemo(
    () => (parsed?.books ?? []).map((device) => ({ device, mine: library.get(norm(device.title)) ?? null })),
    [parsed, library],
  );
  const toMarkDone = matched.filter((m) => m.device.state === "finished" && m.mine && m.mine.status !== "done");
  const reading = matched.filter((m) => m.device.state === "reading").sort((a, b) => b.device.percent - a.device.percent);
  const totalSeconds = matched.reduce((s, m) => s + m.device.secondsRead, 0);
  const byBook = useMemo(() => {
    const groups = new Map<string, Highlight[]>();
    for (const h of parsed?.highlights ?? []) groups.set(h.bookKey, [...(groups.get(h.bookKey) ?? []), h]);
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [parsed]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border p-5">
          <p className="font-heading text-lg">Kobo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect the Kobo by USB. Copy <code className="text-xs">.kobo/KoboReader.sqlite</code> and drop it here.
          </p>
          <label className="mt-3 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            {busy ? "Reading…" : "Choose KoboReader.sqlite"}
            <input type="file" accept=".sqlite,.db" className="sr-only" onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
          </label>
        </div>
        <div className="rounded-2xl border border-border p-5">
          <p className="font-heading text-lg">Kindle</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect the Kindle by USB. Drop <code className="text-xs">documents/My Clippings.txt</code> here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-border px-4 text-sm font-medium">
              Choose My Clippings.txt
              <input type="file" accept=".txt,text/plain" className="sr-only" onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
            </label>
            <Button
              variant="ghost"
              onClick={() => {
                setParsed(parseKindle(SAMPLE_CLIPPINGS));
                setIsSample(true);
                setError(null);
              }}
            >
              Try a sample
            </Button>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Files stay in this browser. Nothing is saved.</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {parsed ? (
        <>
          {isSample ? <p className="text-xs text-amber-600 dark:text-amber-400">Sample clippings from public-domain books, not yours.</p> : null}
          <div className="grid gap-3 sm:grid-cols-4">
            {(parsed.source === "kobo"
              ? [
                  ["Books on the Kobo", parsed.books.length],
                  ["Finished there", parsed.books.filter((b) => b.state === "finished").length],
                  ["Hours read", hours(totalSeconds)],
                  ["Highlights", parsed.highlights.length],
                ]
              : [
                  ["Books", parsed.books.length],
                  ["In thèque", matched.filter((m) => m.mine).length],
                  ["Highlights", parsed.highlights.length],
                  ["Newest", parsed.highlights.at(-1)?.date?.split(" ").slice(1, 4).join(" ") ?? "—"],
                ]
            ).map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-border bg-card/60 p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 font-heading text-2xl tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {toMarkDone.length ? (
            <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5">
              <h2 className="font-heading text-xl">Finished on the Kobo, still on Want here</h2>
              <p className="mt-1 text-sm text-muted-foreground">The real sync marks these done with the Kobo’s last-read date.</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {toMarkDone.map(({ device, mine }) => (
                  <li key={device.key} className="flex flex-wrap items-baseline gap-x-2">
                    <Link href={`/item/${mine!.id}`} className="font-medium underline-offset-4 hover:underline">
                      {mine!.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      finished {device.lastRead?.slice(0, 10) ?? "on an unknown date"} · {hours(device.secondsRead)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {reading.length ? (
            <section>
              <h2 className="font-heading text-xl">Reading now</h2>
              <ul className="mt-3 space-y-2">
                {reading.map(({ device, mine }) => (
                  <li key={device.key} className="rounded-xl border border-border p-3">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">{mine?.title ?? device.title}</span>
                      <span className="tabular-nums text-muted-foreground">{device.percent}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${device.percent}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {hours(device.secondsRead)} so far{device.lastRead ? ` · last opened ${device.lastRead.slice(0, 10)}` : ""}
                      {!mine ? " · not in thèque" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {byBook.length ? (
            <section>
              <h2 className="font-heading text-xl">Highlights</h2>
              <ul className="mt-3 space-y-3">
                {byBook.map(([key, list]) => {
                  const mine = library.get(norm(list[0]!.title));
                  const open = openBook === key;
                  return (
                    <li key={key} className="rounded-2xl border border-border bg-card/60">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenBook(open ? null : key)}
                        className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left"
                      >
                        <span>
                          <span className="font-serif text-lg">{list[0]!.title}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{list[0]!.author}</span>
                        </span>
                        <span className={cn("shrink-0 text-xs", mine ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                          {list.length} · {mine ? "in thèque" : "not in thèque"}
                        </span>
                      </button>
                      {open ? (
                        <div className="space-y-3 border-t border-border px-4 py-4">
                          {list.map((h, i) => (
                            <blockquote key={i} className="border-l-2 border-amber-400/70 pl-3 font-serif text-[15px] leading-relaxed italic">
                              {h.text}
                              {h.note ? <span className="mt-1 block text-xs not-italic text-muted-foreground">Note: {h.note}</span> : null}
                            </blockquote>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

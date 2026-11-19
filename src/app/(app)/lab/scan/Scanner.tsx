"use client";

import { Link } from "next-view-transitions";
import { useCallback, useEffect, useRef, useState } from "react";

import { CoverImg } from "@/components/items/CoverImg";
import { Button } from "@/components/ui/button";
import { normalizeIsbn } from "@/lib/isbn";

import type { LabItem } from "../lab-data";

type Book = Pick<LabItem, "id" | "title" | "authors" | "isbn" | "status" | "rating" | "cover" | "hasFile">;

type Lookup = {
  isbn: string;
  title: string | null;
  authors?: string[];
  year?: string | null;
  pages?: number | null;
  cover?: string | null;
};

type Result = { isbn: string; match: Book | null; exact: boolean; info: Lookup | null; error?: string };

type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;

/** ISBN-10 → ISBN-13, so two editions of the same number compare equal. */
function to13(isbn: string): string {
  if (isbn.length === 13) return isbn;
  const core = `978${isbn.slice(0, 9)}`;
  const sum = [...core].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return `${core}${(10 - (sum % 10)) % 10}`;
}

function norm(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

function surname(name: string): string {
  return norm(name).split(" ").pop() ?? "";
}

/** Same work, other edition: equal title and a shared author surname. */
function fuzzyMatch(books: Book[], info: Lookup): Book | null {
  if (!info.title) return null;
  const title = norm(info.title.split(":")[0]!);
  const names = new Set((info.authors ?? []).map(surname));
  return (
    books.find((b) => norm(b.title.split(":")[0]!) === title && (names.size === 0 || b.authors.some((a) => names.has(surname(a))))) ?? null
  );
}

export function Scanner({ books }: { books: Book[] }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<string>("");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [typed, setTyped] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection needs window, so it runs after mount
    setSupported("BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia);
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const handle = useCallback(
    async (raw: string) => {
      const isbn = normalizeIsbn(raw);
      if (!isbn) {
        setResults((r) => [{ isbn: raw, match: null, exact: false, info: null, error: "That is not a valid ISBN." }, ...r]);
        return;
      }
      const exact = books.find((b) => b.isbn && normalizeIsbn(b.isbn) && to13(normalizeIsbn(b.isbn)!) === to13(isbn)) ?? null;
      setBusy(true);
      let info: Lookup | null = null;
      try {
        const res = await fetch(`/api/lab/isbn?isbn=${isbn}`);
        info = (await res.json()) as Lookup;
      } catch {
        info = null;
      } finally {
        setBusy(false);
      }
      const match = exact ?? (info ? fuzzyMatch(books, info) : null);
      setResults((r) => [{ isbn, match, exact: !!exact, info }, ...r.filter((x) => x.isbn !== isbn)].slice(0, 8));
    },
    [books],
  );

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
      const detector = new Ctor({ formats: ["ean_13"] });
      const loop = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          const code = codes.find((c) => /^97[89]\d{10}$/.test(c.rawValue));
          if (code && code.rawValue !== lastRef.current) {
            lastRef.current = code.rawValue;
            navigator.vibrate?.(60);
            void handle(code.rawValue);
          }
        } catch {
          /* a frame without a code */
        }
        setTimeout(loop, 250);
      };
      void loop();
    } catch {
      setSupported(false);
      stop();
    }
  };

  const sample = books.find((b) => b.isbn)?.isbn;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-border bg-black">
        <div className="relative aspect-[4/3] w-full">
          <video ref={videoRef} playsInline muted className="size-full object-cover" />
          {!scanning ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <p className="font-heading text-2xl">Scan a book’s barcode</p>
              <p className="max-w-xs text-sm opacity-70">
                {supported === false
                  ? "This browser has no barcode reader. Chrome on Android has one. Type the number below instead."
                  : "Hold the EAN barcode on the back cover inside the frame. It reads by itself."}
              </p>
              {supported ? <Button onClick={() => void start()}>Start camera</Button> : null}
            </div>
          ) : (
            <>
              <div aria-hidden className="pointer-events-none absolute inset-x-[12%] top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              <button onClick={stop} className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white">
                Stop
              </button>
            </>
          )}
        </div>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handle(typed);
          setTyped("");
        }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          inputMode="numeric"
          placeholder="Or type an ISBN, for example 978-0-441-01359-3"
          aria-label="ISBN"
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Looking…" : "Look up"}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Try:</span>
        {sample ? (
          <button className="underline underline-offset-4" onClick={() => void handle(sample)}>
            a book you have
          </button>
        ) : null}
        <button className="underline underline-offset-4" onClick={() => void handle("9780441013593")}>
          Dune
        </button>
        <button className="underline underline-offset-4" onClick={() => void handle("9780765382030")}>
          The Three-Body Problem
        </button>
      </div>

      <ul className="space-y-3" aria-live="polite">
        {results.map((r) => (
          <li key={r.isbn} className="flex gap-4 rounded-2xl border border-border bg-card/60 p-4">
            <div className="h-28 w-[4.7rem] shrink-0 overflow-hidden rounded-md bg-muted shadow">
              {r.match?.cover ? (
                <CoverImg urls={r.match.cover} className="size-full object-cover" />
              ) : r.info?.cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- prototype; remote cover
                <img src={r.info.cover} alt="" className="size-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              {r.error ? (
                <p className="text-sm text-destructive">{r.error}</p>
              ) : (
                <>
                  <p className="font-serif text-lg leading-tight">{r.match?.title ?? r.info?.title ?? "Unknown book"}</p>
                  <p className="text-xs text-muted-foreground">
                    {(r.match?.authors ?? r.info?.authors ?? []).join(", ")}
                    {r.info?.year ? ` · ${r.info.year}` : ""} · ISBN {r.isbn}
                  </p>
                  <p className="mt-2 text-sm">
                    {r.match ? (
                      r.match.status === "done" ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          You read this{r.match.rating ? ` · ${"★".repeat(r.match.rating)}` : ""}
                        </span>
                      ) : (
                        <span className="text-sky-600 dark:text-sky-400">
                          Already on your list{r.match.hasFile ? " · on your Kobo" : ""}
                        </span>
                      )
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">Not in your library</span>
                    )}
                    {r.match && !r.exact ? <span className="text-muted-foreground"> (another edition)</span> : null}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.match ? (
                      <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/item/${r.match.id}`} />}>
                        Open
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" title="The real version saves it to Want" onClick={() => alert("Prototype: the real version saves this book to your Want list.")}>
                        Add to Want
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      nativeButton={false}
                      render={<a href={`https://www.goodreads.com/search?q=${r.isbn}`} target="_blank" rel="noopener noreferrer" />}
                    >
                      Goodreads ↗
                    </Button>
                  </div>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        On a phone, the camera needs HTTPS. Run <code>npx next dev --experimental-https</code> and open the LAN address.
      </p>
    </div>
  );
}

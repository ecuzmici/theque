"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, FileUp, ImageDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Imported from the leaf modules, never from `@/lib/import` — the registry
// index pulls in the jsdom-backed bookmark parsers, which cannot ship to a
// browser. Everything referenced here is papaparse-only, so CSV files are
// parsed on the user's machine and never uploaded.
import {
  csvImporterFromMapping,
  csvImporterFromPreset,
  detectCsvPreset,
  readCsvHeaders,
  type CsvColumnMapping,
} from "@/lib/import/csv-engine";
import { CSV_PRESETS } from "@/lib/import/presets";
import { RATING_SCALES, type RatingScaleId } from "@/lib/import/rating";
import {
  fileExtensionOf,
  type ImportInput,
  type ImportRow,
  type ImportSkip,
} from "@/lib/import/types";
import type { ItemCategory } from "@/lib/database.types";
import { CATEGORY_LABELS, formatCategory } from "@/lib/item-labels";
import type {
  EnrichPendingResponseBody,
  ImportParseResponseBody,
  ImportRejection,
  ImportResponseBody,
} from "@/lib/types/api";

/** Rows per request to `/api/import`; the route's own cap is 500. */
const UPLOAD_CHUNK_SIZE = 250;

/**
 * Mirrors `DRAIN_BATCH_SIZE` in `/api/items/enrich-pending`. Only used to size
 * the loop's own safety cap, so drifting from the server is harmless.
 */
const DRAIN_BATCH_HINT = 6;

const MARKUP_EXTENSIONS = [".html", ".htm", ".zip"];

const NONE = "__none__";

const REASON_LABELS: Record<string, string> = {
  missing_url: "No link in this row",
  invalid_url: "Not a valid link",
  unsupported_scheme: "Not a web (http/https) link",
  url_too_long: "Link is too long to store",
  empty_row: "Empty row",
  quota_exceeded: "Library is full — this row did not fit",
  insert_failed: "Could not be saved; run the import again to retry",
};

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

const RATING_SCALE_LABELS: Record<RatingScaleId, string> = {
  five: "0–5 stars (Goodreads, Discogs)",
  ten: "1–10 (IMDb, Trakt, MyAnimeList)",
  half_stars: "0.5–5 half stars (Letterboxd, StoryGraph)",
  quarter_stars: "1–5 quarter stars (Untappd)",
  calibre: "0–10 Calibre",
};

const RATING_SCALE_IDS = Object.keys(RATING_SCALES) as RatingScaleId[];
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ItemCategory[];

type Parsed = {
  importerId: string;
  importerLabel: string;
  rows: ImportRow[];
  skipped: ImportSkip[];
  warnings: string[];
};

type RunTotals = {
  inserted: number;
  duplicates: number;
  failed: number;
  rejected: ImportRejection[];
};

type Stage = "idle" | "mapping" | "preview" | "running" | "done";

/**
 * The cover drain is a second, independent progress track: it outlives the
 * import stage it was started from and can be picked up on a later visit.
 *
 * - `idle` — nothing waiting, nothing to say.
 * - `waiting` — rows are pending and nobody is draining them (a fresh visit
 *   after a closed tab, or a loop the user stopped).
 * - `running` — the loop is calling the endpoint.
 * - `done` — the queue emptied.
 * - `error` — the loop gave up; the backlog is intact and retryable.
 */
type DrainStatus = "idle" | "waiting" | "running" | "done" | "error";

/**
 * Files the browser cannot parse itself: bookmark/Pocket HTML (jsdom) and
 * archives (raw bytes). Sniffed by content as well as extension, because
 * exports get renamed.
 */
function needsServerParse(text: string, filename: string, bytes: Uint8Array): boolean {
  const extension = fileExtensionOf(filename);
  if (extension && MARKUP_EXTENSIONS.includes(extension)) return true;
  // "PK\x03\x04" — every ZIP starts here.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return true;
  return text.slice(0, 1024).trimStart().startsWith("<");
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Settings → Import: file in, shelves out.
 *
 * Four steps, and the third one is the point: **detect → preview → confirm →
 * report**. Auto-detection is by header signature, so a file that identifies
 * itself skips straight to the preview; anything else falls through to a column
 * mapping rather than an error, which is what makes an arbitrary CSV importable.
 * Every rejected row is listed with its reason at the end — a silent drop rate
 * is what makes people distrust an importer.
 */
export function ImportWizard() {
  const [stage, setStage] = useState<Stage>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);

  const [headers, setHeaders] = useState<string[]>([]);
  const [urlColumn, setUrlColumn] = useState<string>("");
  const [titleColumn, setTitleColumn] = useState<string>(NONE);
  const [noteColumn, setNoteColumn] = useState<string>(NONE);
  const [ratingColumn, setRatingColumn] = useState<string>(NONE);
  const [ratingScale, setRatingScale] = useState<RatingScaleId>("five");
  const [defaultCategory, setDefaultCategory] = useState<string>(NONE);

  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [totals, setTotals] = useState<RunTotals | null>(null);

  const [drainStatus, setDrainStatus] = useState<DrainStatus>("idle");
  const [drain, setDrain] = useState({ total: 0, remaining: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  // The loop is a plain async function, not an effect: it must survive re-renders
  // and be stoppable from a button. Refs, not state, so reading them mid-loop
  // never sees a stale closure.
  const drainStopRef = useRef(false);
  const drainRunningRef = useRef(false);
  // Kept so the mapping step can re-parse without re-reading the file, and so
  // the server-parse fallback can upload the original bytes.
  const inputCache = useRef<{ file: File; input: ImportInput } | null>(null);

  const resetAll = useCallback(() => {
    setStage("idle");
    setError(null);
    setFileName(null);
    setParsed(null);
    setHeaders([]);
    setUrlColumn("");
    setTitleColumn(NONE);
    setNoteColumn(NONE);
    setRatingColumn(NONE);
    setRatingScale("five");
    setDefaultCategory(NONE);
    setProgress({ done: 0, total: 0 });
    setTotals(null);
    inputCache.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  /** Pending count, or `null` if we could not ask. Never enriches anything. */
  const fetchRemaining = useCallback(async (): Promise<number | null> => {
    try {
      const res = await fetch("/api/items/enrich-pending", { method: "GET" });
      if (!res.ok) return null;
      const body = (await res.json()) as EnrichPendingResponseBody;
      return body.remaining;
    } catch {
      return null;
    }
  }, []);

  /**
   * Walk the backlog down, one bounded server-side slice per request.
   *
   * Everything that makes this safe lives on the server (the claim is atomic and
   * user-scoped, unfinished rows are handed back). So the loop can stop at any
   * point — a pressed button, a closed tab, a dropped connection — and the only
   * consequence is that the count stops going down.
   */
  const startDrain = useCallback(async () => {
    if (drainRunningRef.current) return;
    drainRunningRef.current = true;
    drainStopRef.current = false;
    setDrainStatus("running");

    try {
      const initial = await fetchRemaining();
      let remaining = initial ?? drain.remaining;
      setDrain({ total: remaining, remaining });
      if (remaining === 0) {
        setDrainStatus("done");
        return;
      }

      // A row that fails transiently returns to `pending` and is retried, up to
      // its attempt cap — so the loop is bounded by roughly three passes, plus
      // slack for rows added while it runs. Without a cap, a permanently
      // unreachable site would keep it spinning.
      const maxCalls = Math.ceil(remaining / DRAIN_BATCH_HINT) * 3 + 10;

      for (let call = 0; call < maxCalls; call += 1) {
        if (drainStopRef.current) {
          setDrainStatus("waiting");
          return;
        }

        let res: Response;
        try {
          res = await fetch("/api/items/enrich-pending", { method: "POST" });
        } catch {
          setDrainStatus("error");
          return;
        }

        if (res.status === 429) {
          const retryAfter = Number.parseInt(res.headers.get("Retry-After") ?? "10", 10);
          await sleep(Math.min(Math.max(Number.isFinite(retryAfter) ? retryAfter : 10, 1), 60) * 1000);
          continue;
        }
        if (!res.ok) {
          setDrainStatus("error");
          return;
        }

        const body = (await res.json()) as EnrichPendingResponseBody;
        remaining = body.remaining;
        // The total can only grow (a capture or a second import mid-drain), so
        // the bar never jumps backwards.
        setDrain((current) => ({
          total: Math.max(current.total, remaining),
          remaining,
        }));

        // `claimed: 0` means nothing was claimable — drained, or another tab
        // holds the rest. Either way this loop has no work left.
        if (remaining === 0 || body.claimed === 0) {
          setDrainStatus("done");
          return;
        }
      }

      // Out of iterations with rows still pending: leave it resumable rather
      // than pretending it finished.
      setDrainStatus("waiting");
    } finally {
      drainRunningRef.current = false;
    }
  }, [drain.remaining, fetchRemaining]);

  // A visit with rows already waiting — the tab was closed part-way through a
  // previous drain, or an import ran on another device. Offer to continue
  // rather than starting outbound fetches nobody asked for.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remaining = await fetchRemaining();
      if (cancelled || !remaining) return;
      setDrain({ total: remaining, remaining });
      setDrainStatus((current) => (current === "idle" ? "waiting" : current));
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchRemaining]);

  // Unmounting (navigating away from Settings) stops the loop at the next slice.
  useEffect(() => {
    return () => {
      drainStopRef.current = true;
    };
  }, []);

  async function parseOnServer(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/import/parse", { method: "POST", body: form });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { code?: string } | null;
      if (body?.code === "file_too_large") {
        setError("That file is larger than 4 MB. Split it and import the parts one at a time.");
      } else if (body?.code === "unrecognized_file") {
        setError(
          "We could not recognise this file. Bookmark and Pocket HTML exports work as-is; for anything else, export it as CSV and map the columns.",
        );
      } else if (res.status === 429) {
        setError("Too many files at once. Wait a minute and try again.");
      } else {
        setError("We could not read that file.");
      }
      return;
    }
    const body = (await res.json()) as ImportParseResponseBody;
    setParsed({
      importerId: body.importer.id,
      importerLabel: body.importer.label,
      rows: body.rows,
      skipped: body.skipped,
      warnings: body.warnings,
    });
    setStage("preview");
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setFileName(file.name);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = new TextDecoder("utf-8").decode(bytes);
      const input: ImportInput = { text, filename: file.name, bytes };
      inputCache.current = { file, input };

      if (needsServerParse(text, file.name, bytes)) {
        await parseOnServer(file);
        return;
      }

      const preset = detectCsvPreset(input, CSV_PRESETS);
      if (preset) {
        const result = await csvImporterFromPreset(preset).parse(input);
        setParsed({
          importerId: preset.id,
          importerLabel: preset.label,
          rows: result.rows,
          skipped: result.skipped,
          warnings: result.warnings,
        });
        setStage("preview");
        return;
      }

      // No preset claimed it — offer the column mapping rather than failing.
      const fileHeaders = readCsvHeaders(text);
      if (fileHeaders.length > 0) {
        setHeaders(fileHeaders);
        setUrlColumn(
          fileHeaders.find((header) => /url|link|address|href|permalink|uri/i.test(header)) ??
            fileHeaders[0],
        );
        setStage("mapping");
        return;
      }

      await parseOnServer(file);
    } catch {
      setError("We could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function applyMapping() {
    const cached = inputCache.current;
    if (!cached || !urlColumn) return;
    setBusy(true);
    setError(null);
    try {
      const mapping: CsvColumnMapping = {
        url: [urlColumn],
        ...(titleColumn !== NONE ? { title: [titleColumn] } : {}),
        ...(noteColumn !== NONE ? { verdict: [noteColumn] } : {}),
        ...(ratingColumn !== NONE
          ? { rating: { columns: [ratingColumn], scale: ratingScale } }
          : {}),
      };
      const importer = csvImporterFromMapping(mapping, {
        label: "Your column mapping",
        file: cached.file.name,
        defaults:
          defaultCategory !== NONE ? { category: defaultCategory as ItemCategory } : undefined,
      });
      const result = await importer.parse(cached.input);
      if (result.rows.length === 0) {
        setError(
          "That mapping produced no rows. Check that the URL column is the one holding the links.",
        );
        return;
      }
      setParsed({
        importerId: importer.id,
        importerLabel: importer.label,
        rows: result.rows,
        skipped: result.skipped,
        warnings: result.warnings,
      });
      setStage("preview");
    } finally {
      setBusy(false);
    }
  }

  async function postChunk(rows: ImportRow[], importerId: string): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, importer: importerId }),
      });
      if (res.status !== 429 || attempt >= 1) return res;
      // One polite retry; the route's bucket is sized for a whole file, so a 429
      // here means another tab or a re-run is already spending it.
      const retryAfter = Number.parseInt(res.headers.get("Retry-After") ?? "5", 10);
      await sleep(Math.min(Math.max(Number.isFinite(retryAfter) ? retryAfter : 5, 1), 30) * 1000);
    }
  }

  async function runImport() {
    if (!parsed) return;
    setStage("running");
    setError(null);
    setProgress({ done: 0, total: parsed.rows.length });

    const running: RunTotals = { inserted: 0, duplicates: 0, failed: 0, rejected: [] };
    let sent = 0;

    for (const batch of chunk(parsed.rows, UPLOAD_CHUNK_SIZE)) {
      let res: Response;
      try {
        res = await postChunk(batch, parsed.importerId);
      } catch {
        setError("The connection dropped part-way. Re-run the import — items already saved are skipped.");
        break;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { code?: string; message?: string }
          | null;
        setError(
          body?.message ??
            (res.status === 401
              ? "Your session expired. Sign in again and re-run the import."
              : "The import stopped part-way. Re-run it — items already saved are skipped."),
        );
        break;
      }

      const body = (await res.json()) as ImportResponseBody;
      running.inserted += body.inserted;
      running.duplicates += body.duplicates;
      running.failed += body.failed;
      running.rejected.push(...body.rejected);
      sent += batch.length;
      setProgress({ done: sent, total: parsed.rows.length });
    }

    setTotals(running);
    setStage("done");

    // The whole point of the import is a shelf that looks like a shelf. Start
    // fetching covers immediately rather than leaving it to the nightly cron.
    if (running.inserted > 0) void startDrain();
  }

  const previewStats = parsed
    ? {
        total: parsed.rows.length,
        rated: parsed.rows.filter((row) => row.rating_personal != null).length,
        done: parsed.rows.filter((row) => row.status === "done").length,
        categories: parsed.rows.reduce<Record<string, number>>((acc, row) => {
          const key = row.category ?? "uncategorized";
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
      }
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import a file</CardTitle>
        <CardDescription>
          Pocket, browser bookmarks, or any CSV with a column of links. We detect the format,
          show you what will land, and only then save it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}

        {stage === "idle" ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) void handleFile(dropped);
            }}
            className={`rounded-[var(--ks-radius-card)] border border-dashed px-6 py-10 text-center transition ${
              dragging ? "border-ring bg-accent/40" : "border-border bg-muted/30"
            }`}
          >
            <FileUp className="mx-auto size-6 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-medium text-foreground">
              Drop your export here, or choose a file
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              .csv, .tsv, .txt, .html or .zip — up to 4 MB
            </p>
            <input
              ref={inputRef}
              id="import-file"
              type="file"
              accept=".csv,.tsv,.txt,.html,.htm,.zip"
              className="sr-only"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (chosen) void handleFile(chosen);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-11"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Reading…" : "Choose a file"}
            </Button>
          </div>
        ) : null}

        {stage === "mapping" ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                We did not recognise {fileName ?? "this file"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tell us which columns to read and it imports just the same.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ColumnPicker
                id="import-map-url"
                label="Link column (required)"
                value={urlColumn}
                onChange={setUrlColumn}
                headers={headers}
              />
              <ColumnPicker
                id="import-map-title"
                label="Title"
                value={titleColumn}
                onChange={setTitleColumn}
                headers={headers}
                optional
              />
              <ColumnPicker
                id="import-map-note"
                label="Note or review"
                value={noteColumn}
                onChange={setNoteColumn}
                headers={headers}
                optional
              />
              <ColumnPicker
                id="import-map-rating"
                label="Rating"
                value={ratingColumn}
                onChange={setRatingColumn}
                headers={headers}
                optional
              />
              {ratingColumn !== NONE ? (
                <div className="grid gap-2">
                  <Label>Rating scale</Label>
                  <Select
                    value={ratingScale}
                    onValueChange={(v) => v && setRatingScale(v as RatingScaleId)}
                  >
                    <SelectTrigger className="h-11 w-full min-h-11">
                      <SelectValue>{RATING_SCALE_LABELS[ratingScale]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {RATING_SCALE_IDS.map((scale) => (
                        <SelectItem key={scale} value={scale}>
                          {RATING_SCALE_LABELS[scale]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label>Shelf for every row</Label>
                <Select
                  value={defaultCategory}
                  onValueChange={(v) => v && setDefaultCategory(v)}
                >
                  <SelectTrigger className="h-11 w-full min-h-11">
                    <SelectValue>
                      {defaultCategory === NONE
                        ? "Let thèque decide"
                        : formatCategory(defaultCategory as ItemCategory)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Let thèque decide</SelectItem>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {formatCategory(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                className="min-h-11"
                disabled={busy || !urlColumn}
                onClick={() => void applyMapping()}
              >
                {busy ? "Reading…" : "Preview"}
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={resetAll}>
                Start over
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "preview" && parsed && previewStats ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                {previewStats.total.toLocaleString()}{" "}
                {previewStats.total === 1 ? "item" : "items"} ready to import
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Detected as {parsed.importerLabel}
                {fileName ? ` from ${fileName}` : ""}.
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Items" value={previewStats.total} />
              <Stat label="With a rating" value={previewStats.rated} />
              <Stat label="Already done" value={previewStats.done} />
              <Stat label="Skipped rows" value={parsed.skipped.length} />
            </dl>

            <div className="flex flex-wrap gap-1.5">
              {Object.entries(previewStats.categories)
                .sort((a, b) => b[1] - a[1])
                .map(([category, count]) => (
                  <span
                    key={category}
                    className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {category === "uncategorized"
                      ? "Sorted on arrival"
                      : formatCategory(category as ItemCategory)}{" "}
                    · {count}
                  </span>
                ))}
            </div>

            {parsed.warnings.length > 0 ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {parsed.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}

            <SkippedList skipped={parsed.skipped} />

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                className="min-h-11"
                disabled={previewStats.total === 0}
                onClick={() => void runImport()}
              >
                Import {previewStats.total.toLocaleString()}{" "}
                {previewStats.total === 1 ? "item" : "items"}
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={resetAll}>
                Choose a different file
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "running" ? (
          <div className="space-y-3" aria-live="polite">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
              Importing {progress.done.toLocaleString()} of {progress.total.toLocaleString()}…
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground/70 transition-[width]"
                style={{
                  width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        {stage === "done" && totals ? (
          <div className="space-y-4" aria-live="polite">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
              {totals.inserted.toLocaleString()} added to your library
            </p>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Added" value={totals.inserted} />
              <Stat label="Already saved" value={totals.duplicates} />
              <Stat label="Not saved" value={totals.failed} />
              <Stat label="Rows skipped" value={totals.rejected.length + (parsed?.skipped.length ?? 0)} />
            </dl>

            <p className="text-xs text-muted-foreground">
              Titles, ratings and verdicts from your file are already on your shelves. Covers and
              details are being fetched now.
            </p>

            <SkippedList
              skipped={[
                ...(parsed?.skipped ?? []),
                ...totals.rejected.map((rejection) => ({
                  line: rejection.line,
                  reason: rejection.reason,
                  raw: rejection.raw,
                })),
              ]}
            />

            <div className="flex flex-wrap gap-3">
              <Button nativeButton={false} render={<Link href="/library" />} className="min-h-11">
                Go to your library
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={resetAll}>
                Import another file
              </Button>
            </div>
          </div>
        ) : null}

        <CoverProgress
          status={drainStatus}
          total={drain.total}
          remaining={drain.remaining}
          onStart={() => void startDrain()}
          onStop={() => {
            drainStopRef.current = true;
          }}
        />
      </CardContent>
    </Card>
  );
}

/**
 * The second progress bar: covers arriving, after the rows have landed.
 *
 * Deliberately separate from the import stages — it survives "Import another
 * file", and it is the thing still worth showing on a visit days later.
 */
function CoverProgress({
  status,
  total,
  remaining,
  onStart,
  onStop,
}: {
  status: DrainStatus;
  total: number;
  remaining: number;
  onStart: () => void;
  onStop: () => void;
}) {
  if (status === "idle") return null;

  const fetched = Math.max(total - remaining, 0);
  const percent = total > 0 ? Math.round((fetched / total) * 100) : 100;

  return (
    <div
      className="space-y-3 rounded-lg border border-border bg-muted/30 px-3 py-3"
      aria-live="polite"
    >
      {status === "running" ? (
        <>
          <p className="flex items-center gap-2 text-sm text-foreground">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
            Fetching covers… {fetched.toLocaleString()} of {total.toLocaleString()}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/70 transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" className="min-h-11" onClick={onStop}>
              Stop
            </Button>
            <p className="text-xs text-muted-foreground">
              You can close this page — covers already fetched are saved, and the rest resume next
              time.
            </p>
          </div>
        </>
      ) : null}

      {status === "waiting" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <ImageDown className="size-4 text-muted-foreground" aria-hidden />
            {remaining.toLocaleString()} {remaining === 1 ? "item is" : "items are"} still waiting
            for covers.
          </p>
          <Button type="button" variant="outline" className="min-h-11" onClick={onStart}>
            Fetch covers
          </Button>
        </div>
      ) : null}

      {status === "done" ? (
        <p className="flex items-center gap-2 text-sm text-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
          Covers are up to date.
        </p>
      ) : null}

      {status === "error" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <CircleAlert className="size-4 text-destructive" aria-hidden />
            Cover fetching stopped. Nothing was lost — {remaining.toLocaleString()} still to go.
          </p>
          <Button type="button" variant="outline" className="min-h-11" onClick={onStart}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-serif text-lg font-semibold text-foreground">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function ColumnPicker({
  id,
  label,
  value,
  onChange,
  headers,
  optional,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  headers: string[];
  optional?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger id={id} className="h-11 w-full min-h-11">
          <SelectValue>{value === NONE ? "Not in this file" : value}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {optional ? <SelectItem value={NONE}>Not in this file</SelectItem> : null}
          {headers.map((header) => (
            <SelectItem key={header} value={header}>
              {header}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Every dropped row, with its reason. Capped for display, never hidden: an
 * importer that quietly loses rows is worse than one that refuses the file.
 */
function SkippedList({ skipped }: { skipped: ImportSkip[] }) {
  if (skipped.length === 0) return null;
  const shown = skipped.slice(0, 50);
  return (
    <details className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <summary className="ks-pointer-coarse-min-hit cursor-pointer text-sm font-medium text-foreground">
        {skipped.length.toLocaleString()} {skipped.length === 1 ? "row" : "rows"} skipped
      </summary>
      <ul className="mt-2 space-y-1">
        {shown.map((skip, index) => (
          <li
            key={`${skip.line ?? "?"}-${index}`}
            className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground"
          >
            {skip.line !== undefined ? (
              <span className="font-mono text-[11px]">Line {skip.line}</span>
            ) : null}
            <span className="text-foreground">{reasonLabel(skip.reason)}</span>
            {skip.raw ? <span className="min-w-0 truncate">{skip.raw}</span> : null}
          </li>
        ))}
      </ul>
      {skipped.length > shown.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          …and {(skipped.length - shown.length).toLocaleString()} more.
        </p>
      ) : null}
    </details>
  );
}

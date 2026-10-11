"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, ClipboardPaste, CopyCheck, Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateMedium } from "@/lib/format-timestamp";

import {
  linkHost,
  parseUrlLines,
  saveLink,
  type CaptureSource,
  type ClipboardLink,
} from "./capture-link";

type ExistingItem = {
  id: string;
  title: string | null;
  domain: string;
  status: string;
  created_at: string;
};

type BatchResult = {
  url: string;
  state: "pending" | "saved" | "duplicate" | "failed";
};

type CandidateState = "reading" | "found" | "none" | "denied";

export type CapturePanelProps = {
  /** A link that came in with the request (share target). It skips the clipboard read. */
  prefillUrl?: string | null;
  prefillNote?: string;
  source: CaptureSource;
  /** The clipboard read that the + tap started. Null means "do not read". */
  clipboard?: Promise<ClipboardLink> | null;
  /** Called after a save. The item id is null when the API returns no item. */
  onSaved: (itemId: string | null) => void;
  /** Called when a link inside the panel navigates away. */
  onNavigate: () => void;
};

/** Looks up a link in the library as the user types. The result is advisory only. */
function useExistingItem(url: string | null): ExistingItem | null {
  const [found, setFound] = useState<{ url: string; item: ExistingItem | null } | null>(null);

  useEffect(() => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/items/check-url?url=${encodeURIComponent(url)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { existing: ExistingItem | null };
        setFound({ url, item: body.existing });
      } catch {
        // The lookup is advisory only.
      }
    }, 400);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [url]);

  return found && found.url === url ? found.item : null;
}

/**
 * The capture sheet body. It offers a one-tap save for a link from the share
 * target or the clipboard, and a link field for everything else. A save goes
 * through `POST /api/capture`, the same path the extension uses.
 */
export function CapturePanel({
  prefillUrl,
  prefillNote = "",
  source,
  clipboard,
  onSaved,
  onNavigate,
}: CapturePanelProps) {
  const [candidate, setCandidate] = useState<string | null>(prefillUrl ?? null);
  const [candidateState, setCandidateState] = useState<CandidateState>(
    prefillUrl ? "found" : clipboard ? "reading" : "denied",
  );
  const [value, setValue] = useState("");
  const [note, setNote] = useState(prefillNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [batchInput, setBatchInput] = useState("");
  const [batchResults, setBatchResults] = useState<BatchResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prefillUrl || !clipboard) return;
    let cancelled = false;
    void clipboard.then((result) => {
      if (cancelled) return;
      if (result.state === "found") setCandidate(result.url);
      setCandidateState(result.state);
    });
    return () => {
      cancelled = true;
    };
  }, [clipboard, prefillUrl]);

  // Without a link to offer, put the cursor in the field on mouse devices.
  // Touch devices skip this so the keyboard does not cover the sheet.
  useEffect(() => {
    if (candidateState !== "none" && candidateState !== "denied") return;
    if (window.matchMedia?.("(pointer: fine)").matches) inputRef.current?.focus();
  }, [candidateState]);

  const typed = value.trim();
  const activeUrl = typed || candidate;
  const existing = useExistingItem(activeUrl);

  async function save(url: string) {
    setBusy(true);
    setError(null);
    const result = await saveLink({ url, note: note.trim(), source });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.itemId);
  }

  async function saveBatch(e: React.FormEvent) {
    e.preventDefault();
    const urls = parseUrlLines(batchInput);
    if (!urls.length) return;
    setBusy(true);
    setBatchResults(urls.map((url) => ({ url, state: "pending" })));
    for (const [index, url] of urls.entries()) {
      // Capture reports duplicates itself (created: false), so no pre-check.
      const result = await saveLink({ url, source });
      const state: BatchResult["state"] = !result.ok
        ? "failed"
        : result.created
          ? "saved"
          : "duplicate";
      setBatchResults((prev) => prev?.map((r, i) => (i === index ? { ...r, state } : r)) ?? prev);
    }
    setBusy(false);
  }

  if (batchMode) {
    const batchUrlCount = parseUrlLines(batchInput).length;
    const batchDone = batchResults != null && batchResults.every((r) => r.state !== "pending");
    return (
      <form onSubmit={(e) => void saveBatch(e)} className="flex flex-col gap-3">
        <div className="grid gap-2">
          <Label htmlFor="capture-batch">Links, one per line</Label>
          <Textarea
            id="capture-batch"
            value={batchInput}
            onChange={(e) => setBatchInput(e.target.value)}
            rows={5}
            placeholder={"https://…\nhttps://…\nhttps://…"}
            disabled={busy || batchResults != null}
          />
          {batchUrlCount > 0 && batchResults == null ? (
            <p className="text-xs text-muted-foreground">
              {batchUrlCount} {batchUrlCount === 1 ? "link" : "links"} detected.
            </p>
          ) : null}
        </div>

        {batchResults ? (
          <ul className="max-h-60 space-y-1.5 overflow-y-auto">
            {batchResults.map((r) => (
              <li
                key={r.url}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
              >
                {r.state === "pending" ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                ) : r.state === "saved" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
                ) : r.state === "duplicate" ? (
                  <CopyCheck className="size-4 shrink-0 text-accent-foreground" aria-hidden />
                ) : (
                  <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-foreground">{r.url}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {r.state === "pending"
                    ? "Saving…"
                    : r.state === "saved"
                      ? "Saved"
                      : r.state === "duplicate"
                        ? "Already saved"
                        : "Failed"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {batchDone ? (
            <Button nativeButton={false} render={<Link href="/library" onClick={onNavigate} />}>
              Go to library
            </Button>
          ) : (
            <Button type="submit" disabled={busy || batchUrlCount === 0}>
              {busy
                ? "Saving…"
                : `Save ${batchUrlCount > 0 ? batchUrlCount : ""} ${batchUrlCount === 1 ? "link" : "links"}`}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBatchMode(false);
              setBatchResults(null);
              setBatchInput("");
            }}
          >
            {batchDone ? "Add more" : "Single link"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {candidate && candidateState === "found" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(candidate)}
          className="ks-pointer-coarse-min-hit flex w-full items-center gap-3 rounded-xl bg-primary p-3 text-left text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
            {busy && !typed ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <ClipboardPaste className="size-5" aria-hidden />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Save {linkHost(candidate)}</span>
            <span className="block truncate text-xs opacity-80">{candidate}</span>
          </span>
        </button>
      ) : (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {candidateState === "reading"
            ? "Checking your clipboard…"
            : candidateState === "none"
              ? "No link on your clipboard. Paste one below."
              : "Paste a link below."}
        </p>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed) void save(typed);
        }}
      >
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background pl-3 pr-1.5 focus-within:ring-2 focus-within:ring-ring">
          <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            type="url"
            inputMode="url"
            aria-label="Link"
            placeholder={candidate ? "Or paste another link" : "https://"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
          />
          {typed ? (
            <Button
              type="submit"
              size="sm"
              disabled={busy}
              variant={candidate ? "secondary" : "default"}
            >
              {busy ? "Saving…" : existing ? "Save anyway" : "Save"}
            </Button>
          ) : null}
        </div>
        <Input
          aria-label="Note (optional)"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-10 rounded-xl text-base sm:text-sm"
        />
      </form>

      {existing ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm">
          <CopyCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-foreground">
            Already in your library:{" "}
            <Link
              href={`/item/${existing.id}`}
              onClick={onNavigate}
              className="font-medium underline underline-offset-2"
            >
              {existing.title ?? existing.domain}
            </Link>
            , saved {formatDateMedium(existing.created_at)}.
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="ks-pointer-coarse-min-hit self-start rounded-md px-1 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => setBatchMode(true)}
      >
        Paste several links
      </button>
    </div>
  );
}

"use client";

import { Paperclip, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { ItemCategory } from "@/lib/database.types";
import { formatDateMedium } from "@/lib/format-timestamp";
import { MAX_BOOK_FILE_BYTES } from "@/lib/input-limits";

/** Shape returned by POST /api/items/:id/file. */
export type BookFile = {
  name: string;
  bytes: number;
  uploaded_at: string;
};

const MAX_MEGABYTES = Math.round(MAX_BOOK_FILE_BYTES / (1024 * 1024));

/** One message per server error code. The user never sees the raw code. */
const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Your session ended. Sign in again, then send the file once more.",
  not_found: "This book is no longer in your library, so the file has nowhere to go.",
  missing_file: "No file arrived. Choose the EPUB again.",
  file_too_large: `That file is bigger than ${MAX_MEGABYTES} MB. Pick a smaller EPUB.`,
  invalid_epub: "That file is not a readable EPUB, so your Kobo cannot open it. Try a different copy of the book.",
  conversion_failed:
    "That EPUB did not convert into the format a Kobo needs for cover art. Try a different copy of the book.",
  drive_not_configured: "Kobo sync is not set up on this server yet, so uploads are off for now. Nothing is wrong with your file.",
  upload_failed: "The file did not reach Google Drive. Try again in a moment.",
  delete_failed: "The file is still on Google Drive. Try removing it again in a moment.",
};

const FALLBACK_MESSAGE = "That did not work. Try again in a moment.";

/** Human file size. Kilobytes stay whole because a decimal adds no meaning. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${Math.round(kilobytes)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(1).replace(/\.0$/, "")} MB`;
}

/** Client-side gate. It stops a doomed upload before the network call. */
function rejectionReason(file: File): string | null {
  if (!/\.epub$/i.test(file.name)) {
    return "A Kobo reads EPUB files. Choose a file that ends in .epub.";
  }
  if (file.size > MAX_BOOK_FILE_BYTES) {
    return `That file is bigger than ${MAX_MEGABYTES} MB. Pick a smaller EPUB.`;
  }
  return null;
}

/**
 * Send the file to the signed staging URL. XMLHttpRequest reports upload
 * progress, and fetch does not. The promise resolves with the HTTP status.
 */
function putWithProgress(url: string, file: File, onProgress: (fraction: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", "application/epub+zip");
    xhr.setRequestHeader("x-upsert", "false");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKey) xhr.setRequestHeader("apikey", anonKey);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error("network error"));
    xhr.onabort = () => reject(new Error("aborted"));
    xhr.send(file);
  });
}

async function messageForResponse(res: Response): Promise<string> {
  let code: string | null = null;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body?.error === "string") code = body.error;
  } catch {
    // The body was not JSON. The fallback message covers it.
  }
  return (code ? ERROR_MESSAGES[code] : null) ?? FALLBACK_MESSAGE;
}

/**
 * Attaches one EPUB to a book. The file lands in a Google Drive folder that
 * the Kobo reads over WiFi, so the shelf and the e-reader stay in step.
 */
export function BookFileField({
  itemId,
  category,
  initialFile = null,
}: {
  itemId: string;
  category: ItemCategory | null;
  /** File already attached to the item, from the server render. */
  initialFile?: BookFile | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<BookFile | null>(initialFile);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  // Share of the bytes that reached storage, from 0 to 1. Null when no upload runs.
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  // The dialog covers the card, so a failed removal reports inside the dialog.
  const [removeError, setRemoveError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  // Only books go to the e-reader. The field self-gates, like StructuredFields.
  if (category !== "books") return null;

  const pending = busy !== null;

  function openPicker() {
    setError(null);
    inputRef.current?.click();
  }

  async function upload(picked: File) {
    // One request at a time. A second upload would race the first one.
    if (busy) return;
    const reason = rejectionReason(picked);
    if (reason) {
      setError(reason);
      return;
    }
    setError(null);
    setBusy("upload");
    setProgress(0);
    try {
      // A Vercel Function refuses a body above 4.5 MB. The file therefore goes
      // to a staging bucket first, and the route reads it from there.
      const signRes = await fetch(`/api/items/${itemId}/file/upload-url`, { method: "POST" });
      if (!signRes.ok) {
        setError(await messageForResponse(signRes));
        return;
      }
      const { path, signedUrl } = (await signRes.json()) as { path: string; signedUrl: string };

      const putStatus = await putWithProgress(signedUrl, picked, setProgress);
      if (putStatus === 413) {
        setError(ERROR_MESSAGES.file_too_large);
        return;
      }
      if (putStatus < 200 || putStatus >= 300) {
        setError(ERROR_MESSAGES.upload_failed);
        return;
      }
      setProgress(1);

      const res = await fetch(`/api/items/${itemId}/file`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        setError(await messageForResponse(res));
        return;
      }
      const data = (await res.json()) as { file: BookFile };
      setFile(data.file);
      router.refresh();
    } catch {
      setError(FALLBACK_MESSAGE);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function remove() {
    if (busy) return;
    setRemoveError(null);
    setBusy("remove");
    try {
      const res = await fetch(`/api/items/${itemId}/file`, { method: "DELETE" });
      if (!res.ok) {
        setRemoveError(await messageForResponse(res));
        return;
      }
      setFile(null);
      setRemoveOpen(false);
      router.refresh();
    } catch {
      setRemoveError(FALLBACK_MESSAGE);
    } finally {
      setBusy(null);
    }
  }

  // The bar fills while the bytes travel. At 100 percent the server converts
  // the file and sends it to Drive, which takes a few seconds more.
  const percent = progress === null ? null : Math.round(progress * 100);
  const progressLabel = percent === null ? null : percent < 100 ? `Uploading… ${percent}%` : "Preparing for your Kobo…";

  // The live region does not read each percent. The progress bar holds the number.
  const status = busy === "upload"
    ? percent !== null && percent >= 100
      ? "Preparing the file for your Kobo…"
      : "Sending the file to your Kobo folder…"
    : busy === "remove"
      ? "Removing the file…"
      : file
        ? `${file.name} is ready for your Kobo. ${formatFileSize(file.bytes)}.`
        : "No file yet.";

  return (
    <section className="mt-8" aria-labelledby={`${inputId}-heading`}>
      <h2 id={`${inputId}-heading`} className="font-heading text-lg text-foreground">
        Kobo file
      </h2>
      <div className="mt-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <Label htmlFor={inputId} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          EPUB file
        </Label>
        <p id={hintId} className="mt-1 text-sm text-muted-foreground">
          Attach an EPUB and your Kobo picks it up on the next WiFi sync. Up to {MAX_MEGABYTES} MB.
        </p>

        {/* The input stays out of sight. The buttons below open the picker. */}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".epub,application/epub+zip"
          className="sr-only"
          disabled={pending}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          onChange={(event) => {
            const picked = event.target.files?.[0];
            // Clear the value so the same file can be chosen two times.
            event.target.value = "";
            if (picked) void upload(picked);
          }}
        />

        {file ? (
          <div className="mt-3 flex items-start gap-2">
            <Paperclip className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium break-words text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.bytes)}
                {file.uploaded_at ? <> · Added {formatDateMedium(file.uploaded_at)}</> : null}
              </p>
            </div>
          </div>
        ) : null}

        <p role="status" aria-live="polite" className="sr-only">
          {status}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {file ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-1.5 lg-fine:min-h-8"
                disabled={pending}
                onClick={openPicker}
              >
                <Upload className="size-4" />
                {busy === "upload" ? "Uploading…" : "Replace file"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="min-h-11 gap-1.5 lg-fine:min-h-8"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  setRemoveError(null);
                  setRemoveOpen(true);
                }}
              >
                <Trash2 className="size-4" />
                Remove file
              </Button>
            </>
          ) : (
            <Button
              type="button"
              className="min-h-11 gap-1.5 lg-fine:min-h-8"
              disabled={pending}
              onClick={openPicker}
            >
              <Upload className="size-4" />
              {busy === "upload" ? "Uploading…" : "Choose EPUB"}
            </Button>
          )}
        </div>

        {busy === "upload" && percent !== null ? (
          <div className="mt-3">
            <div
              role="progressbar"
              aria-label="Upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={`h-full rounded-full bg-primary transition-[width] duration-200 ${percent >= 100 ? "animate-pulse" : ""}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{progressLabel}</p>
          </div>
        ) : null}

        {error ? (
          <p id={errorId} className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this file?</DialogTitle>
            <DialogDescription>
              Remove &quot;{file?.name}&quot; from your Kobo folder. The book stays in your library, and you
              can attach the file again later.
            </DialogDescription>
          </DialogHeader>
          {removeError ? <p className="text-sm text-destructive">{removeError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setRemoveOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => void remove()}>
              {busy === "remove" ? "Removing…" : "Remove file"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, CopyCheck, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateMedium } from "@/lib/format-timestamp";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { extractSharedUrl } from "@/lib/url/shared-url";

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
  itemId?: string;
};

function parseUrlLines(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/\s+/)
        .map((line) => line.trim())
        .filter((line) => /^https?:\/\//i.test(line)),
    ),
  );
}

function AddForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<ExistingItem | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [batchInput, setBatchInput] = useState("");
  const [batchResults, setBatchResults] = useState<BatchResult[] | null>(null);

  // Pre-populate from PWA share target (?url=, ?text=, ?title=).
  // Android share sheet may put the URL in any of these fields.
  const sharedUrl = extractSharedUrl({
    url: searchParams.get("url"),
    text: searchParams.get("text"),
    title: searchParams.get("title"),
  });
  useEffect(() => {
    const sharedTitle = searchParams.get("title") ?? "";
    if (sharedUrl) setUrl(sharedUrl);
    // Skip a title that only carries the link itself.
    const titleIsLink = sharedUrl !== null && sharedTitle.includes(sharedUrl);
    if (sharedTitle && !titleIsLink) setNote((prev) => prev || sharedTitle);
  }, [searchParams, sharedUrl]);

  const isSharedCapture = sharedUrl !== null;

  // Duplicate lookup as you type/paste, debounced.
  useEffect(() => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setExisting(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/items/check-url?url=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { existing: ExistingItem | null };
        setExisting(body.existing);
      } catch {
        // Lookup is advisory only.
      }
    }, 400);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [url]);

  async function captureOne(targetUrl: string, withNote?: string) {
    const res = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: targetUrl,
        source: isSharedCapture ? "mobile_share_extension" : "manual",
        note: withNote || undefined,
      }),
    });
    const body = (await res.json()) as {
      code?: string;
      item?: { id: string };
      created?: boolean;
    };
    return { ok: res.ok, body };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const { ok, body } = await captureOne(trimmed, note.trim());
      if (!ok) {
        setError(body.code ?? "Could not save link.");
        return;
      }
      if (body.item?.id) {
        router.push(`/item/${body.item.id}`);
        router.refresh();
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function onBatchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const urls = parseUrlLines(batchInput);
    if (!urls.length) return;
    setBusy(true);
    setError(null);
    setBatchResults(urls.map((u) => ({ url: u, state: "pending" })));
    try {
      for (const [index, target] of urls.entries()) {
        let state: BatchResult["state"] = "failed";
        let itemId: string | undefined;
        try {
          // Capture reports duplicates itself (created: false), no pre-check needed.
          const { ok, body } = await captureOne(target);
          if (ok) {
            state = body.created === false ? "duplicate" : "saved";
            itemId = body.item?.id;
          }
        } catch {
          state = "failed";
        }
        setBatchResults((prev) =>
          prev
            ? prev.map((r, i) => (i === index ? { ...r, state, itemId } : r))
            : prev,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  const savedAgo = existing ? formatDateMedium(existing.created_at) : null;
  const batchUrlCount = parseUrlLines(batchInput).length;
  const batchDone = batchResults != null && batchResults.every((r) => r.state !== "pending");

  return (
    <div>
      <PageHeader
        title="Add a link"
        description="Paste any URL. We'll grab the details and fill in the card automatically."
      />

      <Card>
        <CardContent className="pt-6">
          {!batchMode ? (
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
              <div className="grid gap-2">
                <Label htmlFor="add-url">URL</Label>
                <Input
                  id="add-url"
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://"
                  className="h-11"
                />
              </div>

              {existing ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-border bg-accent/40 px-3 py-2.5 text-sm">
                  <CopyCheck className="mt-0.5 size-4 shrink-0 text-accent-foreground" aria-hidden />
                  <p className="text-foreground">
                    Already in your library:{" "}
                    <Link
                      href={`/item/${existing.id}`}
                      className="font-medium underline underline-offset-2"
                    >
                      {existing.title ?? existing.domain}
                    </Link>
                    , saved {savedAgo}.
                  </p>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="add-note">Note (optional)</Label>
                <Textarea
                  id="add-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
              </div>

              {error ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={busy || !url.trim()}>
                  {busy ? "Saving…" : existing ? "Save anyway" : "Save link"}
                </Button>
                <Button nativeButton={false} render={<Link href="/library" />} variant="outline">
                  Cancel
                </Button>
                <button
                  type="button"
                  className="ks-pointer-coarse-min-hit ml-auto rounded-md px-1 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => setBatchMode(true)}
                >
                  Paste several links
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={(e) => void onBatchSubmit(e)} className="space-y-5">
              <div className="grid gap-2">
                <Label htmlFor="add-batch">Links, one per line</Label>
                <Textarea
                  id="add-batch"
                  value={batchInput}
                  onChange={(e) => setBatchInput(e.target.value)}
                  rows={6}
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
                <ul className="space-y-1.5">
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
                  <Button nativeButton={false} render={<Link href="/library" />}>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AddPage() {
  return (
    <Suspense>
      <AddForm />
    </Suspense>
  );
}

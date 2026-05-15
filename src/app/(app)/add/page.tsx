"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AddPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmed,
          source: "manual",
          note: note.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { code?: string; item?: { id: string } };
      if (!res.ok) {
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

  return (
    <div>
      <h1 className="font-serif text-3xl tracking-tight text-[color:var(--ks-fg)]">Add a link</h1>
      <p className="mt-2 text-sm text-[color:var(--ks-fg-muted)]">
        Paste any URL — Theque captures it and fills in the card when enrichment finishes.
      </p>

      <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-5 rounded-[var(--ks-radius-card)] border border-[color:var(--ks-border)] bg-[color:var(--ks-surface)] p-6 shadow-[var(--ks-shadow)]">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ks-fg-muted)]">
            URL
          </span>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            className="mt-2 w-full rounded-xl border border-[color:var(--ks-border)] bg-[color:var(--ks-bg)] px-3 py-3 text-base outline-none focus:ring-2 focus:ring-[color:var(--ks-ring)]"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ks-fg-muted)]">
            Note (optional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-2 w-full resize-y rounded-xl border border-[color:var(--ks-border)] bg-[color:var(--ks-bg)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ks-ring)]"
          />
        </label>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="rounded-full bg-[color:var(--ks-accent-soft)] px-6 py-3 text-sm font-semibold text-[color:var(--ks-accent-hover)] ring-1 ring-[color:var(--ks-border)] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save link"}
          </button>
          <Link
            href="/library"
            className="rounded-full px-5 py-3 text-sm font-medium text-[color:var(--ks-fg-muted)] ring-1 ring-[color:var(--ks-border)]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

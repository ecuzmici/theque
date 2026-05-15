"use client";

import { useState } from "react";

import type {
  CaptureTokenCreateResponseBody,
  CaptureTokenListEntry,
  CaptureTokensListResponseBody,
} from "@/lib/types/api";

export function CaptureTokens({ initialTokens }: { initialTokens: CaptureTokenListEntry[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [createdOnce, setCreatedOnce] = useState<CaptureTokenCreateResponseBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/capture-tokens");
      if (!res.ok) {
        setError("Could not load tokens.");
        return;
      }
      const body = (await res.json()) as CaptureTokensListResponseBody;
      setTokens(body.tokens);
    } finally {
      setRefreshing(false);
    }
  }

  const createToken = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/capture-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      if (!res.ok) {
        setError("Create failed.");
        return;
      }
      const body = (await res.json()) as CaptureTokenCreateResponseBody;
      setCreatedOnce(body);
      setName("");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/capture-tokens/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Revoke failed.");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Could not copy — select and copy manually.");
    }
  };

  return (
    <section className="mt-8 rounded-[var(--ks-radius-card)] border border-[color:var(--ks-border)] bg-[color:var(--ks-surface)] p-5 shadow-[var(--ks-shadow)]">
      <h2 className="font-serif text-xl text-[color:var(--ks-fg)]">Capture tokens</h2>
      <p className="mt-2 text-sm text-[color:var(--ks-fg-muted)]">
        Tokens power Chrome and iOS Shortcut capture. Only the prefix is shown after creation; full secret is visible once.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {createdOnce ? (
        <div className="mt-6 rounded-xl border border-amber-300/80 bg-[color:var(--ks-accent-soft)] px-4 py-4 dark:border-amber-700/50">
          <p className="text-sm font-semibold text-[color:var(--ks-accent-hover)]">Copy your new token now</p>
          <p className="mt-2 break-all font-mono text-xs text-[color:var(--ks-fg)]">{createdOnce.token}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copySecret(createdOnce.token)}
              className="rounded-full bg-[color:var(--ks-fg)] px-4 py-2 text-xs font-semibold text-[color:var(--ks-bg)]"
            >
              Copy to clipboard
            </button>
            <button
              type="button"
              onClick={() => setCreatedOnce(null)}
              className="rounded-full px-4 py-2 text-xs font-semibold ring-1 ring-[color:var(--ks-border)]"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ks-fg-muted)]">
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Work laptop, Phone shortcut…"
            className="mt-2 w-full rounded-xl border border-[color:var(--ks-border)] bg-[color:var(--ks-bg)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ks-ring)]"
          />
        </label>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void createToken()}
          className="rounded-full bg-[color:var(--ks-accent-soft)] px-5 py-2.5 text-sm font-semibold text-[color:var(--ks-accent-hover)] ring-1 ring-[color:var(--ks-border)] disabled:opacity-50"
        >
          Create token
        </button>
      </div>

      <div className="mt-8">
        <h3 className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ks-fg-muted)]">
          Your tokens
          {refreshing ? (
            <span className="font-normal normal-case text-[color:var(--ks-fg-muted)]">Updating…</span>
          ) : null}
        </h3>
        {tokens.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--ks-fg-muted)]">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--ks-border)] rounded-xl border border-[color:var(--ks-border)] bg-[color:var(--ks-bg)]">
            {tokens.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium text-[color:var(--ks-fg)]">{t.name}</p>
                  <p className="font-mono text-xs text-[color:var(--ks-fg-muted)]">
                    {t.token_prefix}
                    …
                  </p>
                  <p className="text-[11px] text-[color:var(--ks-fg-muted)]">
                    Created {new Date(t.created_at).toLocaleString()}
                    {t.revoked_at ? (
                      <span className="ml-2 rounded-full bg-[color:var(--ks-bg-muted)] px-2 py-0.5">
                        Revoked
                      </span>
                    ) : null}
                  </p>
                </div>
                {!t.revoked_at ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void revoke(t.id)}
                    className="text-sm font-semibold text-red-700 hover:underline disabled:opacity-50 dark:text-red-400"
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

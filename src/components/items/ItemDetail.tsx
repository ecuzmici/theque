"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StructuredFields } from "@/components/items/StructuredFields";
import type { Database, ItemCategory, ItemStatus } from "@/lib/database.types";

type ItemRow = Database["public"]["Tables"]["items"]["Row"];

export type ItemDetailModel = ItemRow & {
  tags: string[];
  collection_ids: string[];
};

const STATUSES: ItemStatus[] = ["inbox", "want", "planned", "done", "dismissed"];

const CATEGORIES: ItemCategory[] = [
  "books",
  "movies_and_tv",
  "restaurants",
  "products",
  "gifts",
  "travel",
  "recipes",
  "articles",
];

function safeRemoteImageUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.href;
  } catch {
    return null;
  }
}

async function patchItem(itemId: string, body: Record<string, unknown>): Promise<ItemDetailModel | null> {
  const res = await fetch(`/api/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return (await res.json()) as ItemDetailModel;
}

export function ItemDetail({
  initial,
  collections,
}: {
  initial: ItemDetailModel;
  collections: { id: string; name: string }[];
}) {
  const [item, setItem] = useState(initial);
  const [retryBusy, setRetryBusy] = useState(false);
  const [tagsDraft, setTagsDraft] = useState(() => initial.tags.join(", "));
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const imgSrc = useMemo(() => safeRemoteImageUrl(item.image_url), [item.image_url]);

  const syncPatch = useCallback(async (body: Record<string, unknown>) => {
    const next = await patchItem(item.id, body);
    if (next) setItem(next);
  }, [item.id]);

  const scheduleNoteSave = useCallback(
    (note: string) => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
      noteTimer.current = setTimeout(() => {
        void syncPatch({ note });
      }, 650);
    },
    [syncPatch],
  );

  useEffect(() => {
    return () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, []);

  const onRetry = async () => {
    setRetryBusy(true);
    try {
      const res = await fetch(`/api/items/${item.id}/retry-enrichment`, { method: "POST" });
      if (res.ok) {
        setItem((prev) => ({
          ...prev,
          processing_status: "pending",
          enrichment_error: null,
        }));
      }
    } finally {
      setRetryBusy(false);
    }
  };

  const toggleCollection = async (collectionId: string, checked: boolean) => {
    const set = new Set(item.collection_ids);
    if (checked) set.add(collectionId);
    else set.delete(collectionId);
    await syncPatch({ collection_ids: [...set] });
  };

  const onBlurTags = async () => {
    const names = tagsDraft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await syncPatch({ tag_names: names });
  };

  return (
    <div className="pb-12">
      <Link
        href="/library"
        className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--ks-fg-muted)] hover:text-[color:var(--ks-accent)]"
      >
        ← Library
      </Link>

      <div className="relative mt-4 h-[min(40vh,28rem)] w-full overflow-hidden rounded-[var(--ks-radius-card)] bg-[color:var(--ks-bg-muted)] shadow-[var(--ks-shadow)]">
        {imgSrc ? (
          <Image src={imgSrc} alt="" fill priority className="object-cover" sizes="(max-width:768px) 100vw, min(896px, 100vw)" />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[color:var(--ks-fg-muted)]">
            {item.processing_status === "pending" || item.processing_status === "processing"
              ? "Fetching preview image…"
              : item.domain}
          </div>
        )}
      </div>

      <header className="mt-6">
        <h1 className="font-serif text-3xl leading-tight tracking-tight text-[color:var(--ks-fg)]">
          {item.title ?? item.domain}
        </h1>
        {item.subtitle ? (
          <p className="mt-2 text-base text-[color:var(--ks-fg-muted)]">{item.subtitle}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-full bg-[color:var(--ks-accent-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--ks-accent-hover)] ring-1 ring-[color:var(--ks-border)] transition hover:opacity-90"
          >
            Open original
          </a>
          {item.processing_status === "failed" ? (
            <button
              type="button"
              disabled={retryBusy}
              onClick={() => void onRetry()}
              className="rounded-full bg-[color:var(--ks-surface)] px-4 py-2 text-sm font-semibold ring-1 ring-[color:var(--ks-border)] disabled:opacity-50"
            >
              Retry enrichment
            </button>
          ) : null}
        </div>
        {item.processing_status === "failed" && item.enrichment_error ? (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
            {item.enrichment_error}
          </p>
        ) : null}
      </header>

      <section className="mt-8 grid gap-6 rounded-[var(--ks-radius-card)] border border-[color:var(--ks-border)] bg-[color:var(--ks-surface)] p-5 shadow-[var(--ks-shadow)]">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ks-fg-muted)]">
            Note
          </span>
          <textarea
            className="mt-2 min-h-[96px] w-full resize-y rounded-xl border border-[color:var(--ks-border)] bg-[color:var(--ks-bg)] px-3 py-2 text-sm outline-none ring-[color:var(--ks-ring)] focus:ring-2"
            value={item.note ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setItem((prev) => ({ ...prev, note: v }));
              scheduleNoteSave(v);
            }}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ks-fg-muted)]">
              Status
            </span>
            <select
              className="mt-2 w-full rounded-xl border border-[color:var(--ks-border)] bg-[color:var(--ks-bg)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ks-ring)]"
              value={item.status}
              onChange={(e) => {
                const status = e.target.value as ItemStatus;
                setItem((prev) => ({ ...prev, status }));
                void syncPatch({ status });
              }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ks-fg-muted)]">
              Category
            </span>
            <select
              className="mt-2 w-full rounded-xl border border-[color:var(--ks-border)] bg-[color:var(--ks-bg)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ks-ring)]"
              value={item.category ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                const category = raw === "" ? null : (raw as ItemCategory);
                setItem((prev) => ({
                  ...prev,
                  category,
                  category_source: category ? "manual" : null,
                  category_confidence: category ? 1 : null,
                }));
                void syncPatch({ category });
              }}
            >
              <option value="">Uncategorized</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ks-fg-muted)]">
            Tags (comma-separated)
          </span>
          <input
            type="text"
            className="mt-2 w-full rounded-xl border border-[color:var(--ks-border)] bg-[color:var(--ks-bg)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ks-ring)]"
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
            onBlur={() => void onBlurTags()}
          />
        </label>

        <fieldset>
          <legend className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ks-fg-muted)]">
            Collections
          </legend>
          <div className="mt-3 max-h-44 space-y-2 overflow-y-auto rounded-xl border border-[color:var(--ks-border)] bg-[color:var(--ks-bg)] p-3">
            {collections.length === 0 ? (
              <p className="text-sm text-[color:var(--ks-fg-muted)]">No collections yet.</p>
            ) : (
              collections.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.collection_ids.includes(c.id)}
                    onChange={(e) => void toggleCollection(c.id, e.target.checked)}
                    className="rounded border-[color:var(--ks-border)]"
                  />
                  {c.name}
                </label>
              ))
            )}
          </div>
        </fieldset>
      </section>

      <StructuredFields structured={item.structured} />
    </div>
  );
}

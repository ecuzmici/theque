"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ItemCategory, ItemStatus } from "@/lib/database.types";

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

type PatchPayload = {
  status?: ItemStatus;
  category?: ItemCategory | null;
};

type InboxActionsProps = {
  itemId: string;
  category: ItemCategory | null;
  onOptimistic: (patch: PatchPayload, opts?: { remove?: boolean }) => void;
};

export function InboxActions({ itemId, category, onOptimistic }: InboxActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setCatOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const apply = useCallback(
    async (body: PatchPayload, opts?: { remove?: boolean }) => {
      onOptimistic(body, opts);
      setBusy(true);
      try {
        const res = await fetch(`/api/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          router.refresh();
        }
      } finally {
        setBusy(false);
        setOpen(false);
        setCatOpen(false);
      }
    },
    [itemId, onOptimistic, router],
  );

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={busy}
        className="rounded-full bg-[color:var(--ks-surface)]/95 px-3 py-1 text-[11px] font-semibold shadow-[var(--ks-shadow)] ring-1 ring-[color:var(--ks-border)] backdrop-blur disabled:opacity-50"
      >
        Triage
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl border border-[color:var(--ks-border)] bg-[color:var(--ks-surface)] p-2 shadow-[var(--ks-shadow-md)]">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ks-fg-muted)]">
            Inbox
          </p>
          <button
            type="button"
            className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-[color:var(--ks-bg-muted)]"
            onClick={(e) => {
              e.stopPropagation();
              void apply({ status: "want" }, { remove: true });
            }}
          >
            Keep · Want
          </button>
          <button
            type="button"
            className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-[color:var(--ks-bg-muted)]"
            onClick={(e) => {
              e.stopPropagation();
              void apply({ status: "planned" }, { remove: true });
            }}
          >
            Plan
          </button>
          <button
            type="button"
            className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-[color:var(--ks-bg-muted)]"
            onClick={(e) => {
              e.stopPropagation();
              setCatOpen((v) => !v);
            }}
          >
            Wrong type…
          </button>
          {catOpen ? (
            <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-[color:var(--ks-border)] bg-[color:var(--ks-bg)] p-1">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs hover:bg-[color:var(--ks-bg-muted)] ${category === c ? "font-semibold text-[color:var(--ks-accent)]" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void apply({ category: c, status: "want" }, { remove: true });
                  }}
                >
                  {c.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className="mt-1 block w-full rounded-lg px-2 py-2 text-left text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={(e) => {
              e.stopPropagation();
              void apply({ status: "dismissed" }, { remove: true });
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}

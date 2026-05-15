"use client";

import { useState } from "react";

import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { ItemGrid } from "@/components/items/ItemGrid";
import { useDebouncedItemSearch } from "@/hooks/useItems";
import { libraryItemFromSummary } from "@/lib/types/library-item";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const { items, loading } = useDebouncedItemSearch(q);

  const mapped = items.map(libraryItemFromSummary);

  return (
    <div>
      <h1 className="font-serif text-3xl tracking-tight text-[color:var(--ks-fg)]">Search</h1>
      <p className="mt-2 text-sm text-[color:var(--ks-fg-muted)]">Find titles, notes, domains, and descriptions.</p>

      <label className="mt-6 block">
        <span className="sr-only">Search query</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your library…"
          autoComplete="off"
          className="w-full rounded-2xl border border-[color:var(--ks-border)] bg-[color:var(--ks-surface)] px-4 py-3 text-base shadow-[var(--ks-shadow)] outline-none ring-[color:var(--ks-ring)] placeholder:text-[color:var(--ks-fg-muted)] focus:ring-2"
        />
      </label>

      <div className="mt-8">
        {!q.trim() ? (
          <p className="text-center text-sm text-[color:var(--ks-fg-muted)]">Start typing to search.</p>
        ) : loading ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i}>
                <ItemCardSkeleton />
              </li>
            ))}
          </ul>
        ) : mapped.length === 0 ? (
          <p className="text-center text-sm text-[color:var(--ks-fg-muted)]">No matches.</p>
        ) : (
          <ItemGrid items={mapped} shelfId="all" />
        )}
      </div>
    </div>
  );
}

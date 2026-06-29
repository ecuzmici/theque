"use client";

import { useCallback, useEffect, useState } from "react";

import { ItemCardSkeleton } from "@/components/items/ItemCardSkeleton";
import { ItemGrid } from "@/components/items/ItemGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebouncedItemSearch } from "@/hooks/useItems";
import { CATEGORY_LABELS, STATUS_LABELS, formatCategory, formatStatus } from "@/lib/item-labels";
import { libraryItemFromSummary } from "@/lib/types/library-item";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import type { LibraryItemRow } from "@/lib/types/library-item";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ItemCategory[];
const STATUSES = Object.keys(STATUS_LABELS) as ItemStatus[];
const ANY = "__any__";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(ANY);
  const [status, setStatus] = useState(ANY);

  const { items, loading, hasQuery } = useDebouncedItemSearch({
    q,
    category: category === ANY ? "" : (category as ItemCategory),
    status: status === ANY ? "" : (status as ItemStatus),
  });

  const [rows, setRows] = useState<LibraryItemRow[]>([]);

  useEffect(() => {
    setRows(items.map(libraryItemFromSummary));
  }, [items]);

  const onItemPatch = useCallback(
    (
      itemId: string,
      patch: Partial<LibraryItemRow> & { status?: ItemStatus; category?: ItemCategory | null },
      opts?: { remove?: boolean },
    ) => {
      setRows((prev) => {
        if (opts?.remove) return prev.filter((i) => i.id !== itemId);
        return prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
      });
    },
    [],
  );
  const activeFilters = (category !== ANY ? 1 : 0) + (status !== ANY ? 1 : 0);

  const clearFilters = () => {
    setCategory(ANY);
    setStatus(ANY);
  };

  return (
    <div>
      <PageHeader
        title="Search"
        description="Find titles, notes, domains, and descriptions across your library."
      />

      <Label className="sr-only" htmlFor="search-q">
        Search query
      </Label>
      <Input
        id="search-q"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your library…"
        autoComplete="off"
        className="h-11 rounded-xl text-base"
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v ?? ANY)}>
            <SelectTrigger className="h-11 w-full min-h-11">
              <SelectValue>
                {category === ANY ? "Any category" : formatCategory(category as ItemCategory)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any category</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {formatCategory(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v ?? ANY)}>
            <SelectTrigger className="h-11 w-full min-h-11">
              <SelectValue>
                {status === ANY ? "Any status" : formatStatus(status as ItemStatus)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {formatStatus(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {activeFilters > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {category !== ANY ? (
            <Badge variant="secondary">{formatCategory(category as ItemCategory)}</Badge>
          ) : null}
          {status !== ANY ? (
            <Badge variant="secondary">{formatStatus(status as ItemStatus)}</Badge>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : null}

      <div className="mt-8">
        {!hasQuery ? (
          <p className="text-sm text-muted-foreground">
            Type a query or choose a filter to search your library.
          </p>
        ) : loading ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <ItemCardSkeleton />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items match your search.</p>
        ) : (
          <ItemGrid items={rows} shelfId="all" itemActionsEnabled onItemPatch={onItemPatch} />
        )}
      </div>
    </div>
  );
}

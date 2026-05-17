"use client";

import { useEffect, useState } from "react";

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
import type { CollectionListEntry } from "@/lib/types/api";
import { libraryItemFromSummary } from "@/lib/types/library-item";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ItemCategory[];
const STATUSES = Object.keys(STATUS_LABELS) as ItemStatus[];
const ANY = "__any__";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(ANY);
  const [status, setStatus] = useState(ANY);
  const [tag, setTag] = useState("");
  const [collectionId, setCollectionId] = useState(ANY);
  const [collections, setCollections] = useState<CollectionListEntry[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/collections");
      if (!res.ok) return;
      const body = (await res.json()) as { collections: CollectionListEntry[] };
      setCollections(body.collections);
    })();
  }, []);

  const { items, loading, hasQuery } = useDebouncedItemSearch({
    q,
    category: category === ANY ? "" : (category as ItemCategory),
    status: status === ANY ? "" : (status as ItemStatus),
    tag,
    collectionId: collectionId === ANY ? "" : collectionId,
  });

  const mapped = items.map(libraryItemFromSummary);
  const activeFilters =
    (category !== ANY ? 1 : 0) +
    (status !== ANY ? 1 : 0) +
    (tag.trim() ? 1 : 0) +
    (collectionId !== ANY ? 1 : 0);
  const selectedCollection = collections.find((c) => c.id === collectionId);

  const clearFilters = () => {
    setCategory(ANY);
    setStatus(ANY);
    setTag("");
    setCollectionId(ANY);
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="search-tag">
            Tag
          </Label>
          <Input
            id="search-tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="sci-fi"
            className="h-11 rounded-xl text-base"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Collection</Label>
          <Select value={collectionId} onValueChange={(v) => setCollectionId(v ?? ANY)}>
            <SelectTrigger className="h-11 w-full min-h-11">
              <SelectValue>
                {collectionId === ANY ? "Any collection" : (selectedCollection?.name ?? "Collection")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any collection</SelectItem>
              {collections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {activeFilters > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{activeFilters} filter{activeFilters === 1 ? "" : "s"}</Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto text-xs font-medium text-muted-foreground underline-offset-2 hover:bg-transparent hover:text-muted-foreground hover:underline"
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        </div>
      ) : null}

      <div className="mt-8">
        {!hasQuery ? (
          <p className="text-center text-sm text-muted-foreground">
            Type a query or pick a filter to search.
          </p>
        ) : loading ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i}>
                <ItemCardSkeleton />
              </li>
            ))}
          </ul>
        ) : mapped.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No matches.</p>
        ) : (
          <ItemGrid items={mapped} shelfId="all" />
        )}
      </div>
    </div>
  );
}

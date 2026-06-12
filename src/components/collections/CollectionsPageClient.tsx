"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderOpen, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CollectionListEntry } from "@/lib/types/api";
import { cn } from "@/lib/utils";

export type CollectionMosaicTile = {
  src: string | null;
  color: string | null;
};

function CollectionMosaic({ tiles }: { tiles: CollectionMosaicTile[] }) {
  const slots = Array.from({ length: 4 }, (_, i) => tiles[i] ?? null);
  return (
    <div className="grid size-16 shrink-0 grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-lg ring-1 ring-foreground/10" aria-hidden>
      {slots.map((tile, i) => (
        <div
          key={i}
          className={cn("bg-muted", !tile && "bg-muted/60")}
          style={tile?.color && !tile.src ? { backgroundColor: tile.color } : undefined}
        >
          {tile?.src ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy. */}
              <img src={tile.src} alt="" className="h-full w-full object-cover" />
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function CollectionsPageClient({
  initialCollections,
  mosaics = {},
}: {
  initialCollections: CollectionListEntry[];
  mosaics?: Record<string, CollectionMosaicTile[]>;
}) {
  const router = useRouter();
  const [collections, setCollections] = useState(initialCollections);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createCollection() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          description: description.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { code?: string };
        setError(body.code === "duplicate_name" ? "A collection with that name exists." : "Could not create.");
        return;
      }
      const row = (await res.json()) as CollectionListEntry;
      setCollections((prev) =>
        [...prev, { ...row, item_count: 0 }].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setName("");
      setDescription("");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button className="gap-1.5" />}>
            <Plus className="size-4" />
            New collection
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New collection</DialogTitle>
              <DialogDescription>
                Name a context for your saves — e.g. Japan 2026 or Birthday gifts.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="col-name">Name</Label>
                <Input
                  id="col-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Japan 2026"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="col-desc">Description (optional)</Label>
                <Textarea
                  id="col-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" disabled={busy || !name.trim()} onClick={() => void createCollection()}>
                {busy ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {collections.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center px-6 py-12 text-center sm:px-10">
            <div className="w-full max-w-md">
              <FolderOpen className="mx-auto size-10 text-muted-foreground" aria-hidden />
              <h2 className="mt-4 font-serif text-lg font-medium">No collections yet</h2>
              <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
                Collections are your &quot;why&quot; — shelves are the &quot;what kind.&quot;
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {collections.map((c) => (
            <li key={c.id}>
              <Link href={`/collections/${c.id}`} className="block h-full">
                <Card className="h-full transition hover:ring-foreground/20">
                  <CardHeader className="flex flex-row items-center gap-4">
                    <CollectionMosaic tiles={mosaics[c.id] ?? []} />
                    <div className="min-w-0">
                      <CardTitle className="font-serif">{c.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {c.item_count} {c.item_count === 1 ? "item" : "items"}
                        {c.description ? ` · ${c.description}` : ""}
                      </CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

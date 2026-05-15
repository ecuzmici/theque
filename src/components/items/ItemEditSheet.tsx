"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { ItemDetailModel } from "@/components/items/ItemDetail";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/item-labels";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";

const STATUSES = Object.keys(STATUS_LABELS) as ItemStatus[];
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ItemCategory[];
const UNCATEGORIZED = "__none__";

type ItemEditSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemDetailModel;
  collections: { id: string; name: string }[];
  onSave: (patch: Record<string, unknown>) => Promise<ItemDetailModel | null>;
};

function ItemEditForm({
  item,
  collections,
  onSave,
  onClose,
}: Omit<ItemEditSheetProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const [note, setNote] = useState(item.note ?? "");
  const [status, setStatus] = useState(item.status);
  const [categoryValue, setCategoryValue] = useState(item.category ?? UNCATEGORIZED);
  const [tagsDraft, setTagsDraft] = useState(item.tags.join(", "));
  const [collectionIds, setCollectionIds] = useState(item.collection_ids);
  const [busy, setBusy] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, []);

  const scheduleNote = (value: string) => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      void onSave({ note: value });
    }, 650);
  };

  const saveAll = async () => {
    setBusy(true);
    try {
      const tag_names = tagsDraft
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const category =
        categoryValue === UNCATEGORIZED ? null : (categoryValue as ItemCategory);
      await onSave({
        note,
        status,
        category,
        tag_names,
        collection_ids: collectionIds,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const toggleCollection = (id: string, checked: boolean) => {
    setCollectionIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(id);
      else set.delete(id);
      return [...set];
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit details</DialogTitle>
        <DialogDescription>Status, category, tags, and collections.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="edit-note">Note</Label>
          <Textarea
            id="edit-note"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              scheduleNote(e.target.value);
            }}
            rows={3}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => v && setStatus(v as ItemStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select value={categoryValue} onValueChange={(v) => v && setCategoryValue(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNCATEGORIZED}>Uncategorized</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-tags">Tags</Label>
          <Input
            id="edit-tags"
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
            placeholder="sci-fi, for-mom"
          />
          <p className="text-xs text-muted-foreground">Comma-separated</p>
        </div>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Collections</legend>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
            {collections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No collections yet.{" "}
                <Link href="/collections" className="underline">
                  Create one
                </Link>
              </p>
            ) : (
              collections.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={collectionIds.includes(c.id)}
                    onChange={(e) => toggleCollection(c.id, e.target.checked)}
                    className="rounded border-border"
                  />
                  {c.name}
                </label>
              ))
            )}
          </div>
        </fieldset>

        <Button type="button" className="w-full" disabled={busy} onClick={() => void saveAll()}>
          {busy ? "Saving…" : "Done"}
        </Button>
      </div>
    </>
  );
}

export function ItemEditSheet({
  open,
  onOpenChange,
  item,
  collections,
  onSave,
}: ItemEditSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-md">
        {open ? (
          <ItemEditForm
            key={`${item.id}-${item.updated_at}`}
            item={item}
            collections={collections}
            onSave={onSave}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

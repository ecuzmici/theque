"use client";

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
import { CATEGORY_LABELS, STATUS_LABELS, formatCategory, formatStatus } from "@/lib/item-labels";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";

const STATUSES = Object.keys(STATUS_LABELS) as ItemStatus[];
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ItemCategory[];
const UNCATEGORIZED = "__none__";

type ItemEditSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemDetailModel;
  onSave: (patch: Record<string, unknown>) => Promise<ItemDetailModel | null>;
};

function ItemEditForm({
  item,
  onSave,
  onClose,
}: Omit<ItemEditSheetProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const [note, setNote] = useState(item.note ?? "");
  const [status, setStatus] = useState(item.status);
  const [categoryValue, setCategoryValue] = useState(item.category ?? UNCATEGORIZED);
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
      const category =
        categoryValue === UNCATEGORIZED ? null : (categoryValue as ItemCategory);
      await onSave({
        note,
        status,
        category,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit details</DialogTitle>
        <DialogDescription>Status, category, and your note.</DialogDescription>
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
              <SelectTrigger className="h-11 w-full min-h-11">
                <SelectValue>{formatStatus(status)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {formatStatus(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select value={categoryValue} onValueChange={(v) => v && setCategoryValue(v)}>
              <SelectTrigger className="h-11 w-full min-h-11">
                <SelectValue>
                  {categoryValue === UNCATEGORIZED
                    ? "Uncategorized"
                    : formatCategory(categoryValue as ItemCategory)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNCATEGORIZED}>Uncategorized</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {formatCategory(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button type="button" className="h-11 w-full min-h-11" disabled={busy} onClick={() => void saveAll()}>
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
  onSave,
}: ItemEditSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-md">
        {open ? (
          <ItemEditForm
            key={`${item.id}-${item.updated_at}`}
            item={item}
            onSave={onSave}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

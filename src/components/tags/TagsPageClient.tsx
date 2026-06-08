"use client";

import { useState } from "react";
import { Tag, Trash2, Check, X, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MAX_TAG_NAME_LENGTH } from "@/lib/input-limits";
import type { TagListEntry } from "@/app/api/tags/route";

export function TagsPageClient({ initialTags }: { initialTags: TagListEntry[] }) {
  const [tags, setTags] = useState<TagListEntry[]>(initialTags);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit(tag: TagListEntry) {
    setEditingId(tag.id);
    setEditValue(tag.name);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
    setError(null);
  }

  async function saveRename(tagId: string) {
    const trimmed = editValue.trim().toLowerCase();
    if (!trimmed || trimmed.length > MAX_TAG_NAME_LENGTH) {
      setError("Name is invalid.");
      return;
    }
    setBusyId(tagId);
    setError(null);
    try {
      const res = await fetch(`/api/tags/${tagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { code?: string };
        setError(body.code === "duplicate_name" ? "A tag with that name exists." : "Could not rename.");
        return;
      }
      const updated = (await res.json()) as { id: string; name: string; merged: boolean };
      if (updated.merged) {
        // Source tag was deleted, target tag remains — remove source from list
        setTags((prev) =>
          prev
            .filter((t) => t.id !== tagId)
            .map((t) =>
              t.id === updated.id ? { ...t, name: updated.name } : t,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      } else {
        setTags((prev) =>
          prev
            .map((t) => (t.id === tagId ? { ...t, name: updated.name } : t))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
      setEditingId(null);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTag(tagId: string) {
    setBusyId(tagId);
    setError(null);
    try {
      const res = await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        setError("Could not delete tag.");
        return;
      }
      setTags((prev) => prev.filter((t) => t.id !== tagId));
      setConfirmDeleteId(null);
    } finally {
      setBusyId(null);
    }
  }

  if (tags.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center px-6 py-12 text-center sm:px-10">
          <div className="w-full max-w-md">
            <Tag className="mx-auto size-10 text-muted-foreground" aria-hidden />
            <h2 className="mt-4 font-serif text-lg font-medium">No tags yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
              Tags are added when you capture or edit items.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {error ? (
        <p className="mb-4 text-sm text-destructive">{error}</p>
      ) : null}
      <ul className="divide-y divide-border rounded-xl border border-border">
        {tags.map((tag) => {
          const isEditing = editingId === tag.id;
          const isBusy = busyId === tag.id;
          const isConfirmDelete = confirmDeleteId === tag.id;

          return (
            <li key={tag.id} className="flex items-center gap-3 px-4 py-3">
              <Tag className="size-4 shrink-0 text-muted-foreground" aria-hidden />

              {isEditing ? (
                <Input
                  className="h-8 flex-1 text-sm"
                  value={editValue}
                  maxLength={MAX_TAG_NAME_LENGTH}
                  autoFocus
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveRename(tag.id);
                    if (e.key === "Escape") cancelEdit();
                  }}
                  aria-label={`Rename tag ${tag.name}`}
                />
              ) : (
                <span className="flex-1 truncate text-sm font-medium">{tag.name}</span>
              )}

              <span className="shrink-0 text-xs text-muted-foreground">
                {tag.item_count} {tag.item_count === 1 ? "item" : "items"}
              </span>

              {isEditing ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    disabled={isBusy}
                    onClick={() => void saveRename(tag.id)}
                    aria-label="Save"
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={cancelEdit}
                    aria-label="Cancel"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : isConfirmDelete ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">Delete?</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-7 px-2 text-xs"
                    disabled={isBusy}
                    onClick={() => void deleteTag(tag.id)}
                  >
                    Yes
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    No
                  </Button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => startEdit(tag)}
                    aria-label={`Rename tag ${tag.name}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive hover:text-destructive"
                    onClick={() => setConfirmDeleteId(tag.id)}
                    aria-label={`Delete tag ${tag.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

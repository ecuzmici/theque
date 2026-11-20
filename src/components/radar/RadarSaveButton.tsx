"use client";

import { Link } from "next-view-transitions";
import { Check, Loader2, Plus } from "lucide-react";
import { useState } from "react";

import { saveLink } from "@/components/capture/capture-link";
import { Button } from "@/components/ui/button";

type SaveState =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; itemId: string | null; created: boolean }
  | { state: "failed" };

/**
 * Saves a release page to the library through `POST /api/capture`, the path
 * that the capture sheet uses. Enrichment fills in the item later.
 */
export function RadarSaveButton({ url, title }: { url: string; title: string }) {
  const [save, setSave] = useState<SaveState>({ state: "idle" });

  async function onSave() {
    setSave({ state: "saving" });
    const result = await saveLink({ url, source: "manual" });
    setSave(result.ok ? { state: "saved", itemId: result.itemId, created: result.created } : { state: "failed" });
  }

  if (save.state === "saved") {
    const label = save.created ? "Saved" : "In your library";
    return save.itemId ? (
      <Button
        nativeButton={false}
        variant="ghost"
        size="sm"
        render={<Link href={`/item/${save.itemId}`} />}
        className="text-muted-foreground"
      >
        <Check aria-hidden />
        {label}
      </Button>
    ) : (
      <span className="inline-flex items-center gap-1 text-[0.8rem] text-muted-foreground">
        <Check className="size-3.5" aria-hidden />
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={save.state === "saving"}
        aria-label={save.state === "failed" ? undefined : `Save ${title}`}
        onClick={() => void onSave()}
      >
        {save.state === "saving" ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        {save.state === "failed" ? "Try again" : "Save"}
      </Button>
      {save.state === "failed" ? (
        <span role="status" className="text-xs text-destructive">
          Could not save
        </span>
      ) : null}
    </span>
  );
}

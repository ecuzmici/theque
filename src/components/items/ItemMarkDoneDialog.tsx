"use client";

import { Star } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function StarPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value != null && n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="ks-pointer-coarse-min-hit rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onChange(value === n ? null : n)}
          >
            <Star
              className={cn(
                "size-6 transition",
                active ? "fill-amber-500 text-amber-500" : "text-muted-foreground/50",
              )}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Closing the taste loop: marking an item done asks (optionally) what you
 * thought, so the Done shelf becomes a record of taste rather than a graveyard.
 */
export function ItemMarkDoneDialog({
  open,
  onOpenChange,
  verb,
  title,
  initialRating,
  initialVerdict,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  verb: string;
  title: string;
  initialRating: number | null;
  initialVerdict: string | null;
  onSave: (rating: number | null, verdict: string | null) => Promise<boolean>;
}) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [verdict, setVerdict] = useState(initialVerdict ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (open) {
      setRating(initialRating);
      setVerdict(initialVerdict ?? "");
      setError(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    setError(false);
    try {
      const ok = await onSave(rating, verdict.trim() || null);
      if (!ok) {
        setError(true);
        return;
      }
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {verb === "done" ? "Done" : `You ${verb} it`}
          </DialogTitle>
          <DialogDescription>
            How was &ldquo;{title}&rdquo;? Both fields are optional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Your rating</Label>
            <StarPicker value={rating} onChange={setRating} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="verdict">Verdict</Label>
            <Textarea
              id="verdict"
              value={verdict}
              onChange={(e) => setVerdict(e.target.value)}
              rows={2}
              placeholder="One line for future you…"
            />
          </div>
          {error ? <p className="text-sm text-destructive">Could not save. Try again.</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Skip
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save verdict"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

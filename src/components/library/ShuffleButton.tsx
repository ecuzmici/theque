"use client";

import Link from "next/link";
import { Dices } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getDisplayImageUrl } from "@/lib/item-display";
import { doneVerb, formatCategory } from "@/lib/item-labels";
import type { ShelfId } from "@/lib/shelves";
import type { LibraryItemRow } from "@/lib/types/library-item";

/** Picks one random still-wanted item from the shelf — the "what should we watch" button. */
export function ShuffleButton({ shelfId }: { shelfId: ShelfId }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<LibraryItemRow | null>(null);
  const [empty, setEmpty] = useState(false);

  async function shuffle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/items/random?shelf=${shelfId}`);
      if (!res.ok) return;
      const body = (await res.json()) as { item: LibraryItemRow | null };
      setPick(body.item);
      setEmpty(body.item == null);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  const imgSrc = pick ? getDisplayImageUrl(pick.image_storage_path, pick.image_url) : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void shuffle()}
        className="min-h-11 gap-1.5 lg-fine:min-h-8"
      >
        <Dices className="size-4" aria-hidden />
        {busy ? "Picking…" : "Tonight's pick"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
          {empty || !pick ? (
            <div className="p-6">
              <DialogTitle className="font-serif text-lg">Nothing left to pick</DialogTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Everything on this shelf is done or dismissed. Go save something new.
              </p>
            </div>
          ) : (
            <>
              <div
                className="max-h-[45vh] w-full overflow-hidden bg-muted"
                style={pick.dominant_color ? { backgroundColor: pick.dominant_color } : undefined}
              >
                {imgSrc ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy. */}
                    <img src={imgSrc} alt="" className="h-full max-h-[45vh] w-full object-contain" />
                  </>
                ) : null}
              </div>
              <div className="p-5">
                <Badge variant="outline">{formatCategory(pick.category)}</Badge>
                <DialogTitle className="mt-3 font-serif text-xl leading-snug tracking-tight">
                  {pick.title ?? pick.domain}
                </DialogTitle>
                {pick.subtitle ? (
                  <p className="mt-1 text-sm text-muted-foreground">{pick.subtitle}</p>
                ) : null}
                <p className="mt-3 text-sm text-muted-foreground">
                  You saved this for a reason. Get it {doneVerb(pick.category)} tonight?
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    nativeButton={false}
                    render={<Link href={`/item/${pick.id}`} />}
                    className="min-h-11 lg-fine:min-h-8"
                  >
                    Take this one
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void shuffle()}
                    className="min-h-11 gap-1.5 lg-fine:min-h-8"
                  >
                    <Dices className="size-4" aria-hidden />
                    Shuffle again
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

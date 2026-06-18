"use client";

import { Check, FolderInput, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  categoryPlaceholderClass,
  categoryPlaceholderLabel,
} from "@/lib/category-placeholder";
import { getDisplayImageUrl } from "@/lib/item-display";
import { CATEGORY_LABELS, formatCategory } from "@/lib/item-labels";
import type { ItemCategory, ItemStatus } from "@/lib/database.types";
import type { LibraryItemRow } from "@/lib/types/library-item";
import { cn } from "@/lib/utils";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ItemCategory[];
const COMMIT_DISTANCE = 90;

type PatchPayload = { status?: ItemStatus; category?: ItemCategory | null };

type TriageAction = {
  item: LibraryItemRow;
  /** What to PATCH to put the item back where it was. */
  revert: PatchPayload;
};

/**
 * Tinder-style inbox triage: swipe right to keep (want), left to dismiss,
 * or file under a category. Buttons mirror the gestures for desktop.
 */
export function InboxTriageStack({
  items,
  onResolve,
  onExit,
}: {
  items: LibraryItemRow[];
  onResolve: (
    itemId: string,
    patch: PatchPayload,
    opts?: { remove?: boolean; restoreItem?: LibraryItemRow },
  ) => void;
  onExit: () => void;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState<LibraryItemRow[]>(() =>
    items.filter((i) => i.status === "inbox"),
  );
  const [history, setHistory] = useState<TriageAction[]>([]);
  const [drag, setDrag] = useState<{ dx: number; active: boolean }>({ dx: 0, active: false });
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const startXRef = useRef(0);
  const total = queue.length + history.length;

  const current = queue[0] ?? null;
  const next = queue[1] ?? null;

  async function patchItem(itemId: string, body: PatchPayload) {
    const res = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) router.refresh();
  }

  function commit(direction: "left" | "right", patch: PatchPayload) {
    if (!current || leaving) return;
    const item = current;
    setLeaving(direction);
    // Let the fling animation play before swapping cards.
    window.setTimeout(() => {
      setQueue((q) => q.slice(1));
      setHistory((h) => [
        ...h,
        { item, revert: { status: "inbox", category: item.category ?? null } },
      ]);
      setLeaving(null);
      setDrag({ dx: 0, active: false });
    }, 180);
    onResolve(item.id, patch, { remove: true });
    void patchItem(item.id, patch);
  }

  const keep = () => commit("right", { status: "want" });
  const dismiss = () => commit("left", { status: "dismissed" });
  const fileAs = (category: ItemCategory) => commit("right", { category, status: "want" });

  async function undo() {
    const last = history[history.length - 1];
    if (!last || leaving) return;
    setHistory((h) => h.slice(0, -1));
    setQueue((q) => [last.item, ...q]);
    onResolve(last.item.id, last.revert, { restoreItem: last.item });
    await patchItem(last.item.id, last.revert);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (leaving) return;
    startXRef.current = e.clientX;
    setDrag({ dx: 0, active: true });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.active || leaving) return;
    setDrag({ dx: e.clientX - startXRef.current, active: true });
  }

  function onPointerUp() {
    if (!drag.active || leaving) return;
    if (drag.dx > COMMIT_DISTANCE) keep();
    else if (drag.dx < -COMMIT_DISTANCE) dismiss();
    else setDrag({ dx: 0, active: false });
  }

  if (!current) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
        <h2 className="font-heading text-lg font-medium text-card-foreground">Inbox zero</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {history.length > 0
            ? `Nice, ${history.length} ${history.length === 1 ? "item" : "items"} triaged.`
            : "Nothing waiting for triage."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {history.length > 0 ? (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void undo()}>
              <RotateCcw className="size-4" /> Undo last
            </Button>
          ) : null}
          <Button type="button" className="min-h-11" onClick={onExit}>
            Back to shelves
          </Button>
        </div>
      </div>
    );
  }

  const imgSrc = getDisplayImageUrl(current.image_storage_path, current.image_url);
  const dx = leaving === "left" ? -480 : leaving === "right" ? 480 : drag.dx;
  const verdict = dx > 30 ? "keep" : dx < -30 ? "dismiss" : null;

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total - queue.length + 1} of {total}
        </span>
        <button
          type="button"
          className="ks-pointer-coarse-min-hit rounded-md px-1 font-medium underline-offset-2 hover:underline"
          onClick={onExit}
        >
          Exit triage
        </button>
      </div>

      <div className="relative h-[26rem]">
        {next ? (
          <div className="absolute inset-0 translate-y-2 scale-[0.96] overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-hidden>
            <CardFace item={next} imgSrc={getDisplayImageUrl(next.image_storage_path, next.image_url)} />
          </div>
        ) : null}

        <div
          className={cn(
            "absolute inset-0 touch-pan-y overflow-hidden rounded-2xl border border-border bg-card shadow-md select-none",
            !drag.active && "transition-transform duration-200",
            leaving && "opacity-0 transition-all duration-200",
          )}
          style={{ transform: `translateX(${dx}px) rotate(${dx / 22}deg)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <CardFace item={current} imgSrc={imgSrc} />
          {verdict ? (
            <div
              className={cn(
                "absolute top-4 rounded-lg border-2 px-3 py-1 text-sm font-bold uppercase tracking-wide",
                verdict === "keep"
                  ? "left-4 -rotate-12 border-emerald-600 text-emerald-600"
                  : "right-4 rotate-12 border-destructive text-destructive",
              )}
            >
              {verdict === "keep" ? "Keep" : "Dismiss"}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Dismiss"
          className="size-14 rounded-full border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={dismiss}
        >
          <X className="size-6" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="File under a category"
                className="size-11 rounded-full"
              />
            }
          >
            <FolderInput className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="max-h-56 w-44 overflow-y-auto">
            <DropdownMenuLabel>Keep as…</DropdownMenuLabel>
            {CATEGORIES.map((c) => (
              <DropdownMenuItem key={c} onClick={() => fileAs(c)}>
                {formatCategory(c)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Keep (want)"
          className="size-14 rounded-full border-emerald-600/40 text-emerald-700 hover:bg-emerald-600/10 dark:text-emerald-400"
          onClick={keep}
        >
          <Check className="size-6" />
        </Button>
      </div>

      <div className="mt-4 flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!history.length}
          className="min-h-11 gap-1.5 text-muted-foreground lg-fine:min-h-8"
          onClick={() => void undo()}
        >
          <RotateCcw className="size-3.5" /> Undo
        </Button>
      </div>
    </div>
  );
}

function CardFace({ item, imgSrc }: { item: LibraryItemRow; imgSrc: string | null }) {
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "relative flex-1 bg-muted",
          !imgSrc && !item.dominant_color && `bg-gradient-to-br ${categoryPlaceholderClass(item.category)}`,
        )}
        style={item.dominant_color && !imgSrc ? { backgroundColor: item.dominant_color } : undefined}
      >
        {imgSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Remote image hosts are untrusted; avoid the server-side image proxy. */}
            <img src={imgSrc} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
            <span className="font-heading text-sm text-white/90">
              {categoryPlaceholderLabel(item.category)}
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <p className="line-clamp-2 font-heading text-base font-semibold leading-snug text-card-foreground">
          {item.title ?? item.domain}
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {item.subtitle ?? item.domain}
        </p>
      </div>
    </div>
  );
}

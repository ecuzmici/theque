"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

const VISIBLE_MS = 6000;

export type UndoNotice = { key: number; text: string };

/**
 * The undo toast after a decision. It has the place and look of the save-error
 * toast (`SaveErrorRegion`), plus an Undo button. It hides after 6 seconds.
 */
export function UndoToast({
  notice,
  onUndo,
  onDismiss,
}: {
  notice: UndoNotice | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(onDismiss, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:bottom-8"
    >
      {notice ? (
        <div
          key={notice.key}
          className="pointer-events-auto animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-card py-1.5 pr-1.5 pl-4 text-sm text-card-foreground shadow-md"
        >
          <p className="min-w-0 flex-1 truncate">{notice.text}</p>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1.5 px-3" onClick={onUndo}>
            <RotateCcw aria-hidden /> Undo
          </Button>
        </div>
      ) : null}
    </div>
  );
}

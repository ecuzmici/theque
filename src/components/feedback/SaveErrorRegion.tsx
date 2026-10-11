"use client";

import { useEffect, useState } from "react";

import { SAVE_ERROR_EVENT, SAVE_ERROR_MESSAGE } from "@/lib/save-error";

const VISIBLE_MS = 4000;

/** Live region for `reportSaveError()`. Mount it once, in the app shell. */
export function SaveErrorRegion() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const onError = () => {
      setVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), VISIBLE_MS);
    };
    window.addEventListener(SAVE_ERROR_EVENT, onError);
    return () => {
      window.removeEventListener(SAVE_ERROR_EVENT, onError);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--ks-fab-clearance)+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:bottom-[calc(var(--ks-fab-clearance)+0.75rem)]"
    >
      {visible ? (
        <p className="rounded-lg border border-destructive/30 bg-card px-4 py-2 text-sm text-destructive shadow-md">
          {SAVE_ERROR_MESSAGE}
        </p>
      ) : null}
    </div>
  );
}

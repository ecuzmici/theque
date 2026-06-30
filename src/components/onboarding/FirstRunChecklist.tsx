"use client";

/**
 * Slim first-run checklist shown above the All shelf once a user has started
 * (≥1 item) but hasn't finished the core loop or dismissed it. It nudges the
 * three moments that turn a curious visitor into a returning one: make a save,
 * close the loop once (mark something done), and install the extension so
 * saving is frictionless going forward.
 *
 * Step completion for save/done is derived live from library counts; the
 * extension step and the dismissal are the only locally-persisted bits (see
 * `onboarding-storage.ts`). Renders nothing until mounted to keep hydration
 * clean and to avoid flashing the checklist for an already-onboarded user.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Plus, Puzzle, Star, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CHROME_STORE_URL } from "@/lib/extension-identity";
import {
  computeSteps,
  persistChecklistDismissed,
  persistExtensionClicked,
  readChecklistDismissed,
  readExtensionClicked,
  shouldShowChecklist,
} from "@/lib/onboarding/onboarding-storage";
import { cn } from "@/lib/utils";

type Props = {
  totalCount: number;
  doneCount: number;
};

export function FirstRunChecklist({ totalCount, doneCount }: Props) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [extensionClicked, setExtensionClicked] = useState(false);

  useEffect(() => {
    setDismissed(readChecklistDismissed());
    setExtensionClicked(readExtensionClicked());
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const steps = computeSteps(totalCount, doneCount, extensionClicked);
  if (!shouldShowChecklist(totalCount, steps, dismissed)) return null;

  const items = [
    {
      done: steps.saved,
      label: "Save your first link",
      action: (
        <Button
          nativeButton={false}
          render={<Link href="/add" />}
          size="sm"
          variant="outline"
          className="h-8 gap-1"
        >
          <Plus className="size-3.5" aria-hidden />
          Add
        </Button>
      ),
    },
    {
      done: steps.markedDone,
      label: "Mark something done — rate it, close the loop",
      action: null,
    },
    {
      done: steps.extension,
      label: "Install the Chrome extension",
      action: (
        <Button
          nativeButton={false}
          render={
            <a
              href={CHROME_STORE_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                persistExtensionClicked();
                setExtensionClicked(true);
              }}
            />
          }
          size="sm"
          variant="outline"
          className="h-8 gap-1"
        >
          <Puzzle className="size-3.5" aria-hidden />
          Install
        </Button>
      ),
    },
  ];

  const completed = items.filter((i) => i.done).length;

  function dismiss() {
    persistChecklistDismissed();
    setDismissed(true);
  }

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-amber-300/40 bg-amber-50 px-4 py-3.5 dark:border-amber-400/15 dark:bg-amber-500/10 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Star className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
          Get set up
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {completed}/{items.length}
          </span>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss setup checklist"
          className="ks-pointer-coarse-min-hit -mr-1 rounded-md p-1 text-muted-foreground transition hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <ul className="mt-2.5 space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5">
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border",
                item.done
                  ? "border-transparent bg-emerald-600 text-white"
                  : "border-amber-400/50 bg-background",
              )}
              aria-hidden
            >
              {item.done ? <Check className="size-3" /> : null}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 text-sm",
                item.done ? "text-muted-foreground line-through" : "text-foreground",
              )}
            >
              {item.label}
            </span>
            {!item.done && item.action ? <span className="shrink-0">{item.action}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

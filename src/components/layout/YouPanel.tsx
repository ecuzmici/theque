"use client";

import { Link } from "next-view-transitions";
import { BarChart3, ChevronRight, Settings } from "lucide-react";

import { LibrarySpineBand } from "@/components/library/LibrarySpineBand";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const ROW_CLASSES =
  "flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm text-foreground transition-colors hover:bg-muted";

/**
 * The "You" sheet body: library counts with the Spine Band, links to Stats and
 * Settings, and the theme toggle. Any link inside closes the sheet.
 */
export function YouPanel({
  email,
  initial,
  onNavigate,
}: {
  email: string | null;
  initial: string;
  onNavigate: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-4"
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest("a")) onNavigate();
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-heading text-lg text-foreground ring-1 ring-border"
          aria-hidden
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="font-heading text-lg leading-tight">Your library</p>
          {email ? <p className="truncate text-xs text-muted-foreground">{email}</p> : null}
        </div>
      </div>

      <LibrarySpineBand />

      <nav className="-mt-1 flex flex-col" aria-label="Account">
        <Link href="/stats" className={ROW_CLASSES}>
          <BarChart3 className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1">Stats</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
        <Link href="/settings" className={ROW_CLASSES}>
          <Settings className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1">Settings</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
        <div className="flex min-h-11 items-center gap-3 px-2 text-sm">
          <span className="flex-1 text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
      </nav>
    </div>
  );
}

"use client";

/**
 * Cold-start screen for a brand-new, empty library. The empty library is the
 * sharpest churn point — there's nothing to browse, so the value isn't visible.
 * This explains the loop (save → it builds the card → it finds its shelf) and,
 * crucially, lets the user fill a few real cards in one tap via the normal
 * capture path, so the "magic" is felt immediately rather than described.
 *
 * Shown by `LibraryPageClient` on the All shelf only when the total item count
 * is 0; once seeding adds items, the parent refetches and this unmounts.
 */

import Link from "next/link";
import { useState } from "react";
import {
  BookOpen,
  Bookmark,
  CheckCircle2,
  Clapperboard,
  FolderHeart,
  Loader2,
  Newspaper,
  Plus,
  Puzzle,
  Sparkles,
  UtensilsCrossed,
  WandSparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ItemCategory } from "@/lib/database.types";
import { CHROME_STORE_URL } from "@/lib/extension-identity";
import { persistExtensionClicked } from "@/lib/onboarding/onboarding-storage";
import { STARTER_PICKS, type StarterPick } from "@/lib/onboarding/starter-picks";
import { cn } from "@/lib/utils";

type PickState = "idle" | "saving" | "saved" | "failed";

const STEPS = [
  {
    Icon: Bookmark,
    title: "Save in one click",
    detail: "From Chrome or your phone — no forms, no copy-paste.",
  },
  {
    Icon: WandSparkles,
    title: "It builds the card",
    detail: "thèque reads the page for the cover, title, author, rating.",
  },
  {
    Icon: FolderHeart,
    title: "It finds its shelf",
    detail: "Every save sorts itself by what it is, ready to browse.",
  },
] as const;

const CATEGORY_ICON: Record<ItemCategory, typeof BookOpen> = {
  books: BookOpen,
  movies_and_tv: Clapperboard,
  articles: Newspaper,
  recipes: UtensilsCrossed,
  restaurants: UtensilsCrossed,
  products: Bookmark,
  travel: Bookmark,
};

export function EmptyLibraryOnboarding({ onSeeded }: { onSeeded?: () => void }) {
  const [states, setStates] = useState<Record<string, PickState>>({});
  const [seeding, setSeeding] = useState(false);

  async function captureOne(pick: StarterPick): Promise<PickState> {
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: pick.url, source: "manual" }),
      });
      return res.ok ? "saved" : "failed";
    } catch {
      return "failed";
    }
  }

  async function addStarters() {
    if (seeding) return;
    setSeeding(true);
    for (const pick of STARTER_PICKS) {
      setStates((s) => ({ ...s, [pick.url]: "saving" }));
      const next = await captureOne(pick);
      setStates((s) => ({ ...s, [pick.url]: next }));
    }
    setSeeding(false);
    // Hand control back to the library so it refetches and swaps in the cards.
    onSeeded?.();
  }

  function markExtensionClicked() {
    persistExtensionClicked();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-300/40 bg-amber-50/60 p-6 dark:border-amber-400/15 dark:bg-amber-500/5 sm:p-8">
      <div className="mx-auto max-w-xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          <Sparkles className="size-3.5" aria-hidden />
          Welcome to your thèque
        </span>
        <h2 className="mt-4 font-heading text-2xl font-semibold text-foreground text-balance">
          Build your taste library
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
          A private shelf for everything you want to read, watch, cook, and try.
          Save a link and thèque turns it into a card — here is how it works.
        </p>
      </div>

      {/* The loop, stated in three beats. */}
      <ol className="mx-auto mt-7 grid max-w-2xl gap-3 sm:grid-cols-3">
        {STEPS.map((step) => (
          <li
            key={step.title}
            className="rounded-xl border border-border/60 bg-card/70 p-4 text-left"
          >
            <step.Icon className="size-5 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className="mt-2 text-sm font-medium text-foreground">{step.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
          </li>
        ))}
      </ol>

      {/* One-tap starter saves through the real capture path. */}
      <div className="mx-auto mt-7 max-w-2xl rounded-xl border border-border/60 bg-card/70 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-foreground">
          Start with a few favorites
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          We add a few real examples so your library starts full, not empty. They
          are just samples, so delete any you do not want.
        </p>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {STARTER_PICKS.map((pick) => {
            const Icon = CATEGORY_ICON[pick.category] ?? Bookmark;
            const state = states[pick.url] ?? "idle";
            return (
              <li
                key={pick.url}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {pick.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">{pick.kind}</span>
                </span>
                <span className="shrink-0" aria-hidden>
                  {state === "saving" ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : state === "saved" ? (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>

        <Button
          type="button"
          onClick={() => void addStarters()}
          disabled={seeding}
          className="mt-4 min-h-11 w-full gap-1.5 sm:w-auto"
        >
          {seeding ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Adding…
            </>
          ) : (
            <>
              <Sparkles className="size-4" aria-hidden />
              Add these to my library
            </>
          )}
        </Button>
      </div>

      {/* Bring-your-own paths. */}
      <div className="mx-auto mt-5 flex max-w-2xl flex-col items-center justify-center gap-2 sm:flex-row">
        <Button
          nativeButton={false}
          render={<Link href="/add" />}
          variant="outline"
          className={cn("min-h-11 w-full gap-1.5 sm:w-auto")}
        >
          <Plus className="size-4" aria-hidden />
          Add your own link
        </Button>
        <Button
          nativeButton={false}
          render={
            <a href={CHROME_STORE_URL} target="_blank" rel="noreferrer" onClick={markExtensionClicked} />
          }
          variant="ghost"
          className="min-h-11 w-full gap-1.5 text-muted-foreground sm:w-auto"
        >
          <Puzzle className="size-4" aria-hidden />
          Install the Chrome extension
        </Button>
      </div>
    </div>
  );
}

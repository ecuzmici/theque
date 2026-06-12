import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark, FolderHeart, Sparkles, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/* Decorative mini-shelf: category gradient swatches at book/poster/card ratios */
const SHELF_CARDS = [
  { class: "from-amber-950/50 via-amber-900/30 to-stone-900/40", h: "h-24", rotate: "-rotate-2" },
  { class: "from-violet-950/50 via-indigo-900/30 to-stone-900/40", h: "h-28", rotate: "rotate-1" },
  { class: "from-rose-950/50 via-orange-900/25 to-stone-900/40", h: "h-20", rotate: "-rotate-1" },
  { class: "from-teal-950/50 via-cyan-900/25 to-stone-900/40", h: "h-28", rotate: "rotate-2" },
  { class: "from-stone-800/50 via-stone-700/30 to-stone-900/40", h: "h-24", rotate: "-rotate-1" },
] as const;

const FEATURES = [
  { icon: Bookmark, label: "One-tap save", detail: "from Chrome or your phone" },
  { icon: WandSparkles, label: "Auto-enriched cards", detail: "covers, authors, ratings" },
  { icon: FolderHeart, label: "Only yours", detail: "private, no feeds, no likes" },
] as const;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/library");
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-10 px-4 py-12 sm:px-6 sm:py-20">
      <section aria-labelledby="home-heading" className="max-w-lg text-center">
        <p className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:text-sm">
          <Sparkles className="size-3.5 shrink-0 text-accent-foreground" aria-hidden />
          Private taste library
        </p>
        <h1
          id="home-heading"
          className="mt-6 font-serif text-4xl lowercase tracking-[0.04em] text-foreground sm:text-5xl"
        >
          thèque
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Save the books, films, places, and things you want to come back to. Links become rich
          cards on shelves — plus collections for trips and projects.
        </p>
      </section>

      {/* A small shelf, as a promise of the library inside */}
      <div aria-hidden className="flex w-full max-w-sm items-end justify-center gap-3 border-b border-border/80 pb-px">
        {SHELF_CARDS.map((card, i) => (
          <div
            key={i}
            className={`w-14 sm:w-16 ${card.h} ${card.rotate} rounded-md bg-stone-800 bg-gradient-to-br ${card.class} shadow-sm ring-1 ring-foreground/10`}
          />
        ))}
      </div>

      <ul
        className="grid w-full max-w-lg gap-3 text-left sm:grid-cols-3"
        aria-label="Product highlights"
      >
        {FEATURES.map(({ icon: Icon, label, detail }) => (
          <li
            key={label}
            className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
          >
            <Icon className="size-4 text-accent-foreground" aria-hidden />
            <p className="mt-2 text-sm font-medium text-foreground">{label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
          </li>
        ))}
      </ul>

      <div className="flex w-full max-w-xs flex-col items-center gap-3">
        <Button
          nativeButton={false}
          render={<Link href="/login" />}
          size="lg"
          className="h-11 min-h-11 w-full px-6 text-base"
        >
          Sign in with email
        </Button>
        <p className="text-xs text-muted-foreground">No passwords — a sign-in code by email.</p>
      </div>
    </main>
  );
}

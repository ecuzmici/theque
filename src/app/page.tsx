import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
          className="mt-6 font-serif text-4xl tracking-tight text-foreground sm:text-5xl"
        >
          Theque
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Capture links from Chrome or your phone. They become rich cards on shelves — books,
          films, restaurants, gifts — plus collections for trips and projects.
        </p>
        <ul
          className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-3 text-sm text-muted-foreground sm:text-base"
          aria-label="Product highlights"
        >
          <li className="inline-flex items-center gap-2">
            <Bookmark className="size-4 shrink-0" aria-hidden />
            One-tap save
          </li>
          <li>Auto-enriched cards</li>
          <li>Your library, only yours</li>
        </ul>
      </section>
      <Button
        nativeButton={false}
        render={<Link href="/login" />}
        size="lg"
        className="h-11 min-h-11 w-full max-w-xs px-6 text-base sm:w-auto"
      >
        Sign in with email
      </Button>
    </main>
  );
}

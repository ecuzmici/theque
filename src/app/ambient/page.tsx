import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AmbientWall } from "@/components/ambient/AmbientWall";
import { fetchAmbientTiles } from "@/lib/ambient/ambient-tiles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ambient — thèque",
  robots: { index: false, follow: false },
};

export default async function AmbientPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/ambient");
  }

  const tiles = await fetchAmbientTiles(supabase);

  if (tiles.length === 0) {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Your wall is waiting</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Save a few things and their covers will drift here — a calm, living view of your library.
        </p>
        <div className="mt-2 flex items-center gap-4 text-sm">
          <Link
            href="/add"
            className="rounded font-medium text-amber-600 transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 dark:text-amber-400"
          >
            Add a link
          </Link>
          <Link
            href="/library"
            className="rounded text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            Back to library
          </Link>
        </div>
      </main>
    );
  }

  return <AmbientWall tiles={tiles} />;
}

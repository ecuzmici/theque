import Link from "next/link";
import { redirect } from "next/navigation";

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
    <main className="flex min-h-full flex-col items-center justify-center gap-8 px-6 py-24">
      <div className="text-center">
        <h1 className="font-serif text-4xl tracking-tight text-stone-900 dark:text-stone-50">
          Keepswell
        </h1>
        <p className="mt-3 max-w-md text-sm text-stone-600 dark:text-stone-400">
          Your private taste library — save what you&apos;ll love later.
        </p>
      </div>
      <Link
        href="/login"
        className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 dark:bg-amber-100 dark:text-stone-900 dark:hover:bg-amber-200"
      >
        Sign in with email
      </Link>
    </main>
  );
}

"use client";

import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/library";
  const authError = searchParams.get("error") === "auth";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("sent");
    setMessage("Check your email for a sign-in link.");
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-3xl tracking-tight text-stone-900 dark:text-stone-50">
          Keepswell
        </h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Your private taste library
        </p>

        {authError && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            Sign-in failed. Please try again.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-stone-700 dark:text-stone-300">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none transition focus:ring-2 focus:ring-amber-500/50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-50"
              placeholder="you@example.com"
            />
          </label>
          <button
            type="submit"
            disabled={status === "loading" || status === "sent"}
            className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60 dark:bg-amber-100 dark:text-stone-900 dark:hover:bg-amber-200"
          >
            {status === "loading" ? "Sending…" : status === "sent" ? "Link sent" : "Send magic link"}
          </button>
        </form>

        {message && (
          <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">{message}</p>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center text-stone-500">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

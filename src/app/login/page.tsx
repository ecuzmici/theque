"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/library";
  const authError = searchParams.get("error") === "auth";
  const authReason = searchParams.get("reason");

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
    <main className="flex min-h-svh flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="font-serif text-2xl tracking-tight text-card-foreground">Theque</h1>
          <CardDescription id="login-description">
            Sign in with email — your private taste library.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {authError ? (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Sign-in failed. Please try again.
              {authReason ? (
                <span className="mt-1 block text-xs opacity-90">{authReason}</span>
              ) : null}
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4" aria-describedby="login-description">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-xl text-base"
              />
            </div>
            <Button
              type="submit"
              className="h-11 w-full min-h-11 text-base"
              disabled={status === "loading" || status === "sent"}
            >
              {status === "loading" ? "Sending…" : status === "sent" ? "Link sent" : "Send magic link"}
            </Button>
          </form>

          {message ? (
            <p
              className="mt-4 text-sm text-muted-foreground"
              role={status === "error" ? "alert" : "status"}
              aria-live={status === "error" ? "assertive" : "polite"}
            >
              {message}
            </p>
          ) : null}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link
              href="/"
              className="-mx-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 py-2 text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              ← Back to home
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-svh items-center justify-center px-4 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

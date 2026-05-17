"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThequeLogo } from "@/components/brand/ThequeLogo";
import {
  getAuthErrorMessage,
  isValidOtpToken,
  normalizeOtpToken,
  OTP_MAX_LENGTH,
  sanitizeRedirectPath,
} from "./login-utils";

function LoginForm() {
  const searchParams = useSearchParams();
  const safeNext = sanitizeRedirectPath(searchParams.get("next"));
  const authError = searchParams.get("error") === "auth";
  const authReason = searchParams.get("reason");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [step, setStep] = useState<"email" | "code">("email");
  const [token, setToken] = useState("");
  const [pendingAction, setPendingAction] = useState<"send" | "verify" | null>(null);

  const messageId = "login-message";
  const invalidTokenMessage = "Enter the code from your email.";
  const verifyErrorMessage = "That code did not work. Try again or request a new code.";
  const tokenHasError = status === "error" && message === invalidTokenMessage;

  async function sendOtp() {
    setPendingAction("send");
    setStatus("idle");
    setMessage(null);
    setToken("");

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(safeNext)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        setStatus("error");
        setMessage(getAuthErrorMessage(error, "Could not send a sign-in code. Try again."));
        return false;
      }

      setStatus("sent");
      setStep("code");
      setMessage("Check your email for a sign-in code. You can also use the sign-in button in the email.");
      return true;
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await sendOtp();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim();
    const normalizedToken = normalizeOtpToken(token);

    if (!isValidOtpToken(normalizedToken)) {
      setStatus("error");
      setMessage(invalidTokenMessage);
      return;
    }

    setPendingAction("verify");
    setStatus("idle");
    setMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type: "email",
      });

      if (error) {
        setStatus("error");
        setMessage(getAuthErrorMessage(error, verifyErrorMessage));
        return;
      }

      window.location.assign(safeNext);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="m-0 max-w-full p-0">
            <ThequeLogo size="xl" href="/" className="text-card-foreground" />
          </h1>
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

          {step === "email" ? (
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
              <Button type="submit" className="h-11 w-full min-h-11 text-base" disabled={pendingAction !== null}>
                {pendingAction === "send" ? "Sending..." : "Send sign-in code"}
              </Button>
            </form>
          ) : null}

          {step === "code" ? (
            <form onSubmit={handleVerify} className="space-y-4" aria-describedby="login-description">
              <div className="grid gap-2">
                <Label htmlFor="token">Sign-in code</Label>
                <Input
                  id="token"
                  type="text"
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={OTP_MAX_LENGTH}
                  value={token}
                  onChange={(e) => setToken(normalizeOtpToken(e.target.value))}
                  aria-invalid={tokenHasError}
                  aria-describedby={message ? messageId : undefined}
                  placeholder="12345678"
                  className="h-12 rounded-xl text-center font-mono text-xl tracking-[0.3em]"
                />
              </div>
              <Button type="submit" className="h-11 w-full min-h-11 text-base" disabled={pendingAction !== null}>
                {pendingAction === "verify" ? "Checking..." : "Continue to library"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-full text-sm"
                disabled={pendingAction !== null}
                onClick={() => {
                  void sendOtp();
                }}
              >
                {pendingAction === "send" ? "Resending..." : "Resend code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full"
                disabled={pendingAction !== null}
                onClick={() => {
                  setStep("email");
                  setToken("");
                  setStatus("idle");
                  setMessage(null);
                }}
              >
                Use a different email
              </Button>
            </form>
          ) : null}

          {message ? (
            <p
              id={messageId}
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

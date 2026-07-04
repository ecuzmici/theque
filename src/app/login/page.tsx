"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

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

type OAuthProvider = "github" | "google";
type PendingAction = "send" | "verify" | OAuthProvider | null;

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
      <path d="M12 .5C5.73.5.5 5.73.5 12.04c0 5.1 3.29 9.42 7.86 10.95.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.1-3.2.7-3.88-1.37-3.88-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.2-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.75.81 1.2 1.84 1.2 3.1 0 4.43-2.7 5.4-5.26 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.53 11.53 0 0 0 23.5 12.04C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
      <path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.27 6.62l4 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const safeNext = sanitizeRedirectPath(searchParams.get("next"));
  const authError = searchParams.get("error") === "auth";
  const authReason = searchParams.get("reason");
  const accountDeleted = searchParams.get("deleted") === "1";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [step, setStep] = useState<"email" | "code">("email");
  const [token, setToken] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>();
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const captchaRequired = Boolean(TURNSTILE_SITE_KEY);
  const captchaPending = captchaRequired && !captchaToken;
  const busy = pendingAction !== null;

  const messageId = "login-message";
  const invalidTokenMessage = "Enter the code from your email.";
  const verifyErrorMessage = "That code did not work. Try again or request a new code.";
  const tokenHasError = status === "error" && message === invalidTokenMessage;

  function resetCaptcha() {
    setCaptchaToken(undefined);
    turnstileRef.current?.reset();
  }

  async function signInWithProvider(provider: OAuthProvider) {
    setPendingAction(provider);
    setStatus("idle");
    setMessage(null);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (error) {
        setStatus("error");
        setMessage(getAuthErrorMessage(error, "Could not start sign-in. Try again."));
        setPendingAction(null);
      }
      // On success the browser is redirected to the provider; no further work here.
    } catch {
      setStatus("error");
      setMessage("Could not start sign-in. Try again.");
      setPendingAction(null);
    }
  }

  async function sendOtp() {
    setPendingAction("send");
    setStatus("idle");
    setMessage(null);
    setToken("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: captchaToken ? { captchaToken } : undefined,
      });

      if (error) {
        setStatus("error");
        setMessage(getAuthErrorMessage(error, "Could not send a sign-in code. Try again."));
        return false;
      }

      setStatus("sent");
      setStep("code");
      setMessage("Check your email for a sign-in code.");
      return true;
    } finally {
      // Turnstile tokens are single-use; refresh for the next send/resend.
      resetCaptcha();
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

  const turnstileWidget = captchaRequired ? (
    <Turnstile
      ref={turnstileRef}
      siteKey={TURNSTILE_SITE_KEY as string}
      onSuccess={setCaptchaToken}
      onExpire={() => setCaptchaToken(undefined)}
      onError={() => setCaptchaToken(undefined)}
      options={{ size: "flexible" }}
      className="min-h-[65px]"
    />
  ) : null;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="m-0 max-w-full p-0">
            <ThequeLogo size="xl" href="/" className="text-card-foreground" />
          </h1>
          <CardDescription id="login-description">
            {step === "code" ? (
              <>
                Enter the code sent to{" "}
                <span className="font-medium text-foreground">{email.trim()}</span>
              </>
            ) : (
              "Sign in to open your private taste library."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accountDeleted ? (
            <p
              role="status"
              className="mb-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
            >
              Your account has been deleted.
            </p>
          ) : null}

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
            <div className="space-y-4">
              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full min-h-11 justify-center gap-2"
                  disabled={busy}
                  onClick={() => void signInWithProvider("github")}
                >
                  <GitHubIcon />
                  {pendingAction === "github" ? "Redirecting…" : "Continue with GitHub"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full min-h-11 justify-center gap-2"
                  disabled={busy}
                  onClick={() => void signInWithProvider("google")}
                >
                  <GoogleIcon />
                  {pendingAction === "google" ? "Redirecting…" : "Continue with Google"}
                </Button>
              </div>

              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>

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
                {turnstileWidget}
                <Button type="submit" className="h-11 w-full min-h-11" disabled={busy || captchaPending}>
                  {pendingAction === "send" ? "Sending…" : "Send sign-in code"}
                </Button>
              </form>
            </div>
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
              <Button type="submit" className="h-11 w-full min-h-11" disabled={busy}>
                {pendingAction === "verify" ? "Checking…" : "Continue to library"}
              </Button>
              {turnstileWidget}
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-full text-sm"
                disabled={busy || captchaPending}
                onClick={() => {
                  void sendOtp();
                }}
              >
                {pendingAction === "send" ? "Resending…" : "Resend code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full"
                disabled={busy}
                onClick={() => {
                  setStep("email");
                  setToken("");
                  setStatus("idle");
                  setMessage(null);
                  resetCaptcha();
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

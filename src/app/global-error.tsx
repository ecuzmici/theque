"use client";

import "./globals.css";

/**
 * Replaces the root layout when the layout itself fails. It renders its own
 * document, so it gets no theme class. The colors follow the OS scheme.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        <title>thèque: something went wrong</title>
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 text-center">
          <h1 className="text-lg font-medium">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            thèque could not load. Your library is safe. Try again in a moment.
          </p>
          {error.digest ? (
            <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            className="mt-6 min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

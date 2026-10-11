"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Error boundary for the signed-in pages. The app shell stays visible. */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // The digest matches the server log line. The message can hold private text.
    console.error("[app] render_failed:", error.digest ?? "client_error");
  }, [error]);

  return (
    <Card className="border-dashed">
      <CardContent className="flex w-full flex-col items-center px-6 py-14 text-center sm:px-10">
        <div className="w-full max-w-md">
          <h2 className="font-heading text-lg font-medium text-card-foreground">
            This page could not load
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
            Something went wrong on our side. Your library is safe. Try again in a moment.
          </p>
          <Button type="button" className="mt-6 min-h-11" onClick={() => retry()}>
            Try again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

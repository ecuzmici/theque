"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  digestDayLabel,
  type DigestPreferences,
  type DigestPreferencesResponseBody,
} from "@/lib/profiles/digest-preferences";

/**
 * Settings → "Email": the one switch for the weekly shelf letter. Optimistic
 * toggle with a rollback on failure, so a dead network never leaves the UI
 * claiming a preference the server did not take.
 */
export function EmailPreferences({
  initialPreferences,
  userEmail,
}: {
  initialPreferences: DigestPreferences;
  userEmail?: string;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = preferences.digest_enabled;

  async function toggle() {
    const previous = preferences;
    const next = { ...preferences, digest_enabled: !preferences.digest_enabled };
    setPreferences(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/digest", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest_enabled: next.digest_enabled }),
      });
      if (!res.ok) {
        setPreferences(previous);
        setError("Could not save your email preference. Try again.");
        return;
      }
      const body = (await res.json()) as DigestPreferencesResponseBody;
      setPreferences(body.preferences);
    } catch {
      setPreferences(previous);
      setError("Could not save your email preference. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Email</CardTitle>
        <CardDescription>
          A weekly letter about what is still sitting on your shelves
          {userEmail ? `, sent to ${userEmail}` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Weekly letter</p>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? `On — arrives on ${digestDayLabel(preferences.digest_day)}s.`
                : "Off — you will not get the weekly letter."}
            </p>
          </div>
          <Button
            type="button"
            variant={enabled ? "outline" : "default"}
            aria-pressed={enabled}
            disabled={busy}
            onClick={() => void toggle()}
          >
            {enabled ? "Turn off" : "Turn on"}
          </Button>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

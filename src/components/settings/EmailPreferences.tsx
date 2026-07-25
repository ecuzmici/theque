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
 * Settings → "Email": the switches for the weekly shelf letter and for the
 * AI personalization consent that letter's recommendation card depends on.
 * Optimistic toggles with a rollback on failure, so a dead network never leaves
 * the UI claiming a preference the server did not take.
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
  const aiEnabled = preferences.ai_personalization_enabled;

  async function save(patch: Partial<DigestPreferences>) {
    const previous = preferences;
    const next = { ...preferences, ...patch };
    setPreferences(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/digest", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
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
            onClick={() => void save({ digest_enabled: !enabled })}
          >
            {enabled ? "Turn off" : "Turn on"}
          </Button>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Personalized recommendation in the letter
              </p>
              <p className="text-xs text-muted-foreground">
                {aiEnabled
                  ? "On — your titles and verdict notes are sent to the AI provider each time your letter is built."
                  : "Off — nothing from your library is sent to an AI provider for your letter."}
              </p>
            </div>
            <Button
              type="button"
              variant={aiEnabled ? "outline" : "default"}
              aria-pressed={aiEnabled}
              disabled={busy}
              onClick={() => void save({ ai_personalization_enabled: !aiEnabled })}
            >
              {aiEnabled ? "Turn off" : "Turn on"}
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            To add one suggestion to your weekly letter, thèque sends the titles of items in
            your library and the verdict notes you wrote about them to a third-party AI
            provider (via the Vercel AI Gateway). They are used only to generate that
            recommendation. This is off unless you turn it on, and the rest of your letter —
            your shelf items and star links — works without it. Turning it off stops the
            sending from the next letter onwards. It covers the weekly letter only: asking
            for picks yourself in the app sends the same data at that moment, because you
            asked for them.
          </p>
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

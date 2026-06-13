"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SignOutButton } from "@/components/settings/SignOutButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatDbTimestampUtc } from "@/lib/format-timestamp";
import type {
  CaptureTokenCreateResponseBody,
  CaptureTokenListEntry,
  CaptureTokensListResponseBody,
} from "@/lib/types/api";

export function CaptureTokens({
  initialTokens,
  userEmail,
}: {
  initialTokens: CaptureTokenListEntry[];
  userEmail?: string;
}) {
  const router = useRouter();
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [createdOnce, setCreatedOnce] = useState<CaptureTokenCreateResponseBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/capture-tokens");
      if (!res.ok) {
        setError("Could not load tokens.");
        return;
      }
      const body = (await res.json()) as CaptureTokensListResponseBody;
      setTokens(body.tokens);
    } finally {
      setRefreshing(false);
    }
  }

  const createToken = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/capture-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      if (!res.ok) {
        setError("Create failed.");
        return;
      }
      const body = (await res.json()) as CaptureTokenCreateResponseBody;
      setCreatedOnce(body);
      setName("");
      await reload();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/capture-tokens/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Revoke failed.");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Couldn't copy automatically. Select the text and copy it.");
    }
  };

  return (
    <div className="space-y-6">
      {userEmail ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>Signed in as {userEmail}</CardDescription>
          </CardHeader>
          <CardContent>
            <SignOutButton />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Capture tokens</CardTitle>
          <CardDescription>
            Tokens power Chrome and iOS Shortcut capture. The full secret is shown only once at
            creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {createdOnce ? (
            <div className="rounded-xl border border-accent-foreground/20 bg-accent px-4 py-4">
              <p className="text-sm font-semibold text-accent-foreground">Copy your new token now</p>
              <p className="mt-2 break-all font-mono text-xs">{createdOnce.token}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void copySecret(createdOnce.token)}>
                  Copy to clipboard
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setCreatedOnce(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Work laptop, Phone shortcut…"
              />
            </div>
            <Button type="button" disabled={busy || !name.trim()} onClick={() => void createToken()}>
              Create token
            </Button>
          </div>

          <Separator />

          <div>
            <h3 className="flex flex-wrap items-center gap-2 text-sm font-medium">
              Your tokens
              {refreshing ? (
                <span className="text-xs font-normal text-muted-foreground">Updating…</span>
              ) : null}
            </h3>
            {tokens.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                {tokens.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{t.token_prefix}…</p>
                      <p className="text-xs text-muted-foreground">
                        Created {formatDbTimestampUtc(t.created_at)}
                        {t.revoked_at ? (
                          <Badge variant="secondary" className="ml-2">
                            Revoked
                          </Badge>
                        ) : null}
                      </p>
                    </div>
                    {!t.revoked_at ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        className="text-destructive hover:text-destructive"
                        onClick={() => void revoke(t.id)}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

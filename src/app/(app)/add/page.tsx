"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function AddPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmed,
          source: "manual",
          note: note.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { code?: string; item?: { id: string } };
      if (!res.ok) {
        setError(body.code ?? "Could not save link.");
        return;
      }
      if (body.item?.id) {
        router.push(`/item/${body.item.id}`);
        router.refresh();
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Add a link"
        description="Paste any URL — Theque captures it and fills in the card when enrichment finishes."
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="add-url">URL</Label>
              <Input
                id="add-url"
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                className="h-11"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="add-note">Note (optional)</Label>
              <Textarea
                id="add-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </div>

            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy || !url.trim()}>
                {busy ? "Saving…" : "Save link"}
              </Button>
              <Button nativeButton={false} render={<Link href="/library" />} variant="outline">
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

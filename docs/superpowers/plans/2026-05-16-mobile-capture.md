# Mobile Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable 2-tap mobile capture via clipboard quick-save, PWA install guide, and PWA share target.

**Architecture:** Three client-side features layered on the existing `/api/capture` endpoint. ClipboardSaveBar and PwaInstallBanner mount inside LibraryPageClient. A new `/save` route handles Android share target auto-capture. One DB migration adds `clipboard` to `item_source` enum.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind, Clipboard API, Web App Manifest share_target, Supabase Postgres.

**Spec:** [mobile-capture-design.md](../specs/2026-05-16-mobile-capture-design.md)

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260516_add_clipboard_source.sql` | Create | Add `clipboard` to `item_source` enum |
| `src/lib/database.types.ts` | Modify | Add `clipboard` to `ItemSource` type |
| `src/app/api/capture/route.ts` | Modify | Add `"clipboard"` to `SOURCES` set |
| `public/manifest.json` | Modify | Add `share_target`, improve icons array |
| `src/middleware.ts` | Modify | Add `/save` to protected routes |
| `src/components/library/ClipboardSaveBar.tsx` | Create | Clipboard detection + one-tap save bar |
| `src/components/library/PwaInstallBanner.tsx` | Create | PWA install encouragement banner |
| `src/app/(app)/save/page.tsx` | Create | Share target handler (auto-capture + confirmation) |
| `src/components/library/LibraryPageClient.tsx` | Modify | Mount ClipboardSaveBar + PwaInstallBanner |

---

## Task 1: Database Migration — Add `clipboard` Source

**Files:**
- Create: `supabase/migrations/20260516_add_clipboard_source.sql`
- Modify: `src/lib/database.types.ts`
- Modify: `src/app/api/capture/route.ts`

- [ ] **Step 1: Create migration file**

```sql
-- Add clipboard source for mobile clipboard quick-save
ALTER TYPE item_source ADD VALUE IF NOT EXISTS 'clipboard';
```

- [ ] **Step 2: Update TypeScript types**

In `src/lib/database.types.ts`, find the `ItemSource` type (or the generated enum mapping) and add `"clipboard"` to the union.

- [ ] **Step 3: Add `clipboard` to SOURCES set in capture route**

In `src/app/api/capture/route.ts`, update the `SOURCES` set (line ~17):

```typescript
const SOURCES = new Set<ItemSource>([
  "chrome_extension",
  "ios_shortcut",
  "manual",
  "mobile_share_extension",
  "clipboard",
]);
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: No type errors.

---

## Task 2: PWA Manifest — Share Target + Icons

**Files:**
- Modify: `public/manifest.json`

- [ ] **Step 1: Update manifest.json**

Replace the current content of `public/manifest.json` with:

```json
{
  "name": "thèque",
  "short_name": "thèque",
  "description": "Your private taste library — save what you'll love later.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#faf8f5",
  "theme_color": "#b45309",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any"
    }
  ],
  "share_target": {
    "action": "/save",
    "method": "GET",
    "params": {
      "url": "url",
      "title": "title",
      "text": "text"
    }
  }
}
```

- [ ] **Step 2: Verify manifest loads**

```bash
npm run dev
```

Open `http://localhost:3000/manifest.json` and confirm the `share_target` and `icons` are present.

---

## Task 3: Middleware — Protect `/save` Route

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add `/save` to protected prefixes**

In `src/middleware.ts`, add `"/save"` to the `PROTECTED_PREFIXES` array:

```typescript
const PROTECTED_PREFIXES = [
  "/library",
  "/settings",
  "/item",
  "/search",
  "/add",
  "/save",
] as const;
```

- [ ] **Step 2: Add `/save` to the matcher config**

```typescript
export const config = {
  matcher: [
    "/",
    "/login",
    "/login/:path*",
    "/library",
    "/library/:path*",
    "/settings",
    "/settings/:path*",
    "/item/:path*",
    "/search",
    "/search/:path*",
    "/add",
    "/add/:path*",
    "/save",
  ],
};
```

Expected: Unauthenticated requests to `/save?url=...` redirect to `/login?next=/save?url=...`.

---

## Task 4: Share Target Handler — `/save` Page

**Files:**
- Create: `src/app/(app)/save/page.tsx`

- [ ] **Step 1: Create the save page component**

```tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

import { ThequeLogo } from "@/components/brand/ThequeLogo";

function extractUrl(params: URLSearchParams): string | null {
  const urlParam = params.get("url");
  if (urlParam && /^https?:\/\//i.test(urlParam)) return urlParam;

  const textParam = params.get("text");
  if (textParam) {
    const match = textParam.match(/https?:\/\/[^\s]+/i);
    if (match) return match[0];
  }
  return null;
}

export default function SavePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<"saving" | "saved" | "duplicate" | "error">("saving");
  const [itemId, setItemId] = useState<string | null>(null);
  const [domain, setDomain] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const url = extractUrl(searchParams);

  useEffect(() => {
    if (!url) {
      setState("error");
      setErrorMsg("No valid URL found.");
      return;
    }

    try {
      setDomain(new URL(url).hostname.replace(/^www\./, ""));
    } catch {
      setDomain(url);
    }

    let cancelled = false;

    async function capture() {
      try {
        const res = await fetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, source: "mobile_share_extension" }),
        });
        const body = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setState("error");
          setErrorMsg(body.code ?? "Capture failed.");
          return;
        }

        setItemId(body.item?.id ?? null);
        setState(body.created ? "saved" : "duplicate");
      } catch {
        if (!cancelled) {
          setState("error");
          setErrorMsg("Network error.");
        }
      }
    }

    void capture();
    return () => { cancelled = true; };
  }, [url]);

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
      <ThequeLogo size="lg" />

      {state === "saving" && (
        <div className="mt-8 space-y-3">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Saving {domain}…</p>
        </div>
      )}

      {state === "saved" && (
        <div className="mt-8 space-y-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mx-auto">
            <span className="text-2xl">✓</span>
          </div>
          <p className="text-lg font-semibold">Saved to thèque</p>
          <p className="text-sm text-muted-foreground">{domain}</p>
          <div className="flex flex-col gap-2 pt-2">
            {itemId && (
              <Link href={`/item/${itemId}`} className="text-sm font-medium text-primary underline">
                View item
              </Link>
            )}
            <Link href="/library" className="text-sm text-muted-foreground underline">
              Go to library
            </Link>
          </div>
        </div>
      )}

      {state === "duplicate" && (
        <div className="mt-8 space-y-4">
          <p className="text-lg font-semibold">Already saved</p>
          <p className="text-sm text-muted-foreground">{domain} is already in your library.</p>
          <div className="flex flex-col gap-2 pt-2">
            {itemId && (
              <Link href={`/item/${itemId}`} className="text-sm font-medium text-primary underline">
                View item
              </Link>
            )}
            <Link href="/library" className="text-sm text-muted-foreground underline">
              Go to library
            </Link>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="mt-8 space-y-4">
          <p className="text-lg font-semibold text-destructive">Something went wrong</p>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <Link href="/add" className="text-sm font-medium text-primary underline">
            Try adding manually
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the route works**

```bash
npm run dev
```

Navigate to `http://localhost:3000/save?url=https://www.imdb.com/title/tt1375666/`. Expected: auto-captures and shows success/duplicate.

Navigate to `http://localhost:3000/save?text=Check+this+out+https://example.com`. Expected: extracts URL from text and captures.

Navigate to `http://localhost:3000/save` (no params). Expected: shows "No valid URL found" error.

---

## Task 5: Clipboard Save Bar Component

**Files:**
- Create: `src/components/library/ClipboardSaveBar.tsx`

- [ ] **Step 1: Create ClipboardSaveBar**

```tsx
"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Clipboard, X, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type BarState = "idle" | "saving" | "saved" | "duplicate" | "no-url" | "error" | "denied" | "dismissed";

export function ClipboardSaveBar() {
  const [state, setState] = useState<BarState>("idle");
  const [detail, setDetail] = useState<{ domain?: string; itemId?: string; title?: string }>({});
  const [errorMsg, setErrorMsg] = useState("");

  // Hide on non-secure contexts or missing clipboard API
  if (typeof window !== "undefined" && !navigator.clipboard?.readText) return null;

  const dismiss = useCallback(() => setState("dismissed"), []);

  async function handleTap() {
    if (state === "saving") return;
    setState("saving");
    setErrorMsg("");

    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setState("denied");
      return;
    }

    const trimmed = text.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setState("no-url");
      setTimeout(() => setState("idle"), 3000);
      return;
    }

    let domain = trimmed;
    try { domain = new URL(trimmed).hostname.replace(/^www\./, ""); } catch {}
    setDetail({ domain });

    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, source: "clipboard" }),
      });
      const body = await res.json();

      if (!res.ok) {
        setState("error");
        setErrorMsg(body.code ?? "Save failed.");
        return;
      }

      setDetail({ domain, itemId: body.item?.id, title: body.item?.title });
      setState(body.created ? "saved" : "duplicate");

      // Auto-dismiss success after 4s
      if (body.created) {
        setTimeout(() => setState("idle"), 4000);
      }
    } catch {
      setState("error");
      setErrorMsg("Network error — tap to retry.");
    }
  }

  if (state === "dismissed") return null;

  const barStyles = "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors";

  if (state === "saved") {
    return (
      <div className={`${barStyles} border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30`}>
        <Check className="size-4 shrink-0 text-green-600" />
        <span className="min-w-0 flex-1">
          Saved — <span className="font-medium">{detail.domain}</span>
          {detail.itemId && (
            <Link href={`/item/${detail.itemId}`} className="ml-2 text-primary underline">View</Link>
          )}
        </span>
      </div>
    );
  }

  if (state === "duplicate") {
    return (
      <div className={`${barStyles} border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30`}>
        <Check className="size-4 shrink-0 text-amber-600" />
        <span className="min-w-0 flex-1">
          Already saved — <span className="font-medium">{detail.title || detail.domain}</span>
          {detail.itemId && (
            <Link href={`/item/${detail.itemId}`} className="ml-2 text-primary underline">View</Link>
          )}
        </span>
      </div>
    );
  }

  if (state === "no-url") {
    return (
      <div className={`${barStyles} border-muted bg-muted/50`}>
        <AlertCircle className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">No link found on clipboard</span>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className={`${barStyles} border-muted bg-muted/50 cursor-pointer`} onClick={() => void handleTap()}>
        <AlertCircle className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">Permission denied — tap again to retry</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className={`${barStyles} border-destructive/30 bg-destructive/5 cursor-pointer`} onClick={() => void handleTap()}>
        <AlertCircle className="size-4 shrink-0 text-destructive" />
        <span className="text-destructive">{errorMsg || "Error — tap to retry"}</span>
      </div>
    );
  }

  // idle / saving
  return (
    <div
      className={`${barStyles} border-primary/20 bg-primary/5 cursor-pointer active:bg-primary/10`}
      onClick={() => void handleTap()}
      role="button"
      tabIndex={0}
    >
      {state === "saving" ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      ) : (
        <Clipboard className="size-4 shrink-0 text-primary" />
      )}
      <span className="min-w-0 flex-1 font-medium">
        {state === "saving" ? "Reading clipboard…" : "Save from clipboard"}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="size-7 shrink-0 p-0"
        onClick={(e) => { e.stopPropagation(); dismiss(); }}
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify component renders**

Mount it temporarily in the library page and test on desktop (should appear) and verify tap → clipboard read flow.

---

## Task 6: PWA Install Banner Component

**Files:**
- Create: `src/components/library/PwaInstallBanner.tsx`

- [ ] **Step 1: Create PwaInstallBanner**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Smartphone, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "theque-pwa-install-dismissed";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (Date.now() - ts > DISMISS_TTL_MS) {
      localStorage.removeItem(DISMISS_KEY);
      return false;
    }
    return true;
  } catch { return false; }
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as any).standalone === true;
}

function detectPlatform(): "ios" | "android" | "other" {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "other";
}

export function PwaInstallBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    // Only show on mobile-ish viewports
    const mq = window.matchMedia("(max-width: 1024px)");
    if (!mq.matches) return;

    setPlatform(detectPlatform());
    setVisible(true);

    function handlePrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }, []);

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      dismiss();
      return;
    }
    setExpanded((e) => !e);
  }

  if (!visible) return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <Smartphone className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Add thèque to your home screen</p>
          <p className="text-xs text-muted-foreground">Quick access and one-tap saving</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => void handleInstall()}>
          {deferredPrompt ? "Install" : expanded ? <ChevronUp className="size-4" /> : "How"}
        </Button>
        <Button variant="ghost" size="sm" className="size-7 shrink-0 p-0" onClick={dismiss} aria-label="Dismiss">
          <X className="size-3.5" />
        </Button>
      </div>

      {expanded && !deferredPrompt && (
        <div className="mt-3 rounded-lg bg-background/60 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
          {platform === "ios" ? (
            <p>Tap the <strong>Share</strong> button (□↑) at the bottom of Safari → scroll down → <strong>Add to Home Screen</strong> → tap <strong>Add</strong>.</p>
          ) : platform === "android" ? (
            <p>Tap the <strong>⋮ menu</strong> at the top right → <strong>Add to Home Screen</strong> or <strong>Install App</strong> → tap <strong>Install</strong>.</p>
          ) : (
            <p>Look for an "Install" or "Add to Home Screen" option in your browser&apos;s menu.</p>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Task 7: Mount Banners in Library Page

**Files:**
- Modify: `src/components/library/LibraryPageClient.tsx`

- [ ] **Step 1: Import and mount both components**

At the top of `LibraryPageClient.tsx`, add imports:

```tsx
import { PwaInstallBanner } from "@/components/library/PwaInstallBanner";
import { ClipboardSaveBar } from "@/components/library/ClipboardSaveBar";
```

Inside the component's return, add both banners above the existing shelf tabs / item grid, wrapped in a container with spacing:

```tsx
<div className="mb-4 space-y-2">
  <PwaInstallBanner />
  <ClipboardSaveBar />
</div>
```

- [ ] **Step 2: Verify both banners render on mobile viewport**

```bash
npm run dev
```

Open `http://localhost:3000/library` in Chrome DevTools with mobile viewport. Expected: both banners appear above the library grid. Dismiss works. Clipboard bar reads clipboard on tap.

---

## Task 8: Verification

- [ ] **Step 1: Run lint and build**

```bash
npm run lint
npm run build
```

Expected: No errors.

- [ ] **Step 2: Test clipboard flow**

On mobile (or mobile emulation): copy a URL → open library → tap "Save from clipboard" → verify item appears.

- [ ] **Step 3: Test share target (Android only)**

Install PWA on Android Chrome → share a URL from any app → verify Theque appears in share sheet → verify `/save` page captures and confirms.

- [ ] **Step 4: Test PWA install banner**

Open on mobile browser (not installed) → verify banner shows → tap "How" → verify platform instructions → dismiss → verify stays dismissed → verify reappears after 14 days (adjust localStorage timestamp to test).

- [ ] **Step 5: Test middleware redirect**

Open `/save?url=https://example.com` in incognito → verify redirect to `/login?next=/save?url=https://example.com`.

---

## Completion Criteria

- Clipboard "Save from clipboard" bar renders on mobile library page and captures URLs in one tap.
- PWA install banner shows platform-specific instructions and dismisses for 14 days.
- `public/manifest.json` includes `share_target` pointing to `/save`.
- `/save?url=...` auto-captures and shows confirmation; handles duplicates and errors.
- `/save` is protected by middleware (redirects unauthenticated users to login).
- `clipboard` source value accepted by capture API.
- `npm run lint` and `npm run build` pass.

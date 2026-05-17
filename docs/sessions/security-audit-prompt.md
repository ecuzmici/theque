# Theque — Full Security Audit (Read-Only)

## Mission

You are conducting a **comprehensive security audit** of **Theque**, a personal visual taste library built with Next.js 16, Supabase (Postgres + Auth + Storage), and a Chrome MV3 extension. Your audit is **read-only** — you must **not edit any source files**. You will produce a detailed markdown report at the end.

## Setup Instructions

> **Important**: Run this audit in a separate worktree on a different port so it doesn't interfere with the main dev environment.

```bash
# 1. Create and enter the audit worktree
cd c:\Users\emilc\projects\bookmarkly
git worktree add .worktrees/security-audit HEAD
cd .worktrees/security-audit

# 2. Install dependencies
npm install

# 3. Copy env (needed for the app to start — secrets stay local)
copy ..\..\..\.env.local .env.local

# 4. Start the dev server on port 3001
$env:PORT=3001; npx next dev --port 3001
```

Wait for the dev server to be ready on `http://localhost:3001` before proceeding.

## Scope — What To Audit

Audit **every** category below. For each, read the relevant source files, reason about the threat model, and note findings.

---

### 1. Authentication & Session Management

**Files to read:**
- `src/middleware.ts` — route protection, session refresh, redirect logic
- `src/lib/auth/session-user.ts` — session extraction
- `src/lib/auth/capture-token.ts` — bearer token minting, hashing, lookup
- `src/lib/supabase/server.ts` — server-side Supabase client (cookie handling)
- `src/lib/supabase/admin.ts` — service-role admin client
- `src/lib/supabase/client.ts` — browser-side Supabase client
- `src/app/login/page.tsx` — OTP login UI
- `src/app/login/login-utils.ts` — OTP normalization, redirect sanitization
- `src/app/auth/callback/route.ts` — magic-link code exchange
- `src/app/api/dev/qa-session/route.ts` — dev-only QA session backdoor

**Check for:**
- [ ] Open redirect via `?next=` parameter in login, callback, middleware, QA session
- [ ] OTP brute-force feasibility (rate limiting, lockout)
- [ ] Session fixation or session cookie misconfiguration (HttpOnly, Secure, SameSite, Path)
- [ ] Whether the QA session route is **actually** gated behind `NODE_ENV === "development"` and can't be reached in production (check Vercel env behavior: `process.env.NODE_ENV` in Next.js production builds is always `"production"`)
- [ ] Whether `SUPABASE_SERVICE_ROLE_KEY` can leak to the client via `NEXT_PUBLIC_*` prefix mistakes
- [ ] Capture token entropy — `randomBytes(24)` → base64url = 32 chars. Enough?
- [ ] Timing-safe comparison for capture token hash lookup (or is SHA-256 lookup sufficient?)
- [ ] Whether revoked tokens are truly rejected (check `revoked_at` filter in `lookupCaptureTokenUser`)
- [ ] Cookie handling in `setAll` — are headers like `Cache-Control` being set correctly?

---

### 2. API Route Authorization (IDOR / Broken Access Control)

**Files to read:**
- `src/app/api/capture/route.ts` — POST capture (session or bearer token)
- `src/app/api/items/route.ts` — GET items list
- `src/app/api/items/[id]/route.ts` — GET, PATCH, DELETE single item
- `src/app/api/items/[id]/retry-enrichment/route.ts`
- `src/app/api/items/[id]/ai-enrichment-proposal/route.ts`
- `src/app/api/items/[id]/ai-enrichment-apply/route.ts`
- `src/app/api/collections/route.ts` — GET, POST collections
- `src/app/api/collections/[id]/route.ts` — PATCH, DELETE collection
- `src/app/api/capture-tokens/route.ts` — GET, POST tokens
- `src/app/api/capture-tokens/[id]/route.ts` — DELETE (revoke) token
- `src/app/api/jobs/enrich/route.ts` — cron enrichment endpoint

**Check for:**
- [ ] **IDOR**: Can user A access/modify/delete user B's items, collections, or tokens by guessing UUIDs? Trace the `user_id` filter on every query.
- [ ] Does the capture route properly scope admin-client queries with `user_id` when using bearer tokens (no RLS)?
- [ ] In `PATCH /api/items/[id]` — tag and collection operations use admin client. Are they properly scoped to the authenticated user?
- [ ] The enrichment cron route: is `CRON_SECRET` compared safely? Could an attacker enumerate or brute-force it?
- [ ] Missing HTTP method handlers — do unimplemented methods (e.g., PUT on items) get a proper 405 or does Next.js handle this?
- [ ] Rate limiting on any endpoint (likely missing — document it)
- [ ] `collection_ids` validation in capture route — does the ownership check use admin or user client? Could an attacker link items to collections they don't own?

---

### 3. Input Validation & Injection

**Files to read:**
- `src/app/api/capture/route.ts` — body parsing, URL normalization
- `src/app/api/items/[id]/route.ts` — PATCH body parsing
- `src/app/api/items/route.ts` — query param parsing (ilike search)
- `src/lib/url/normalize.ts` — URL normalization
- `src/lib/url/fingerprint.ts` — URL fingerprinting
- `src/lib/url/domain.ts` — domain extraction
- `src/app/api/collections/route.ts` — collection name/description
- `src/lib/enrichment/extract.ts` — HTML metadata extraction
- `src/lib/enrichment/parsers/` — all parser files (imdb, goodreads, generic)
- `src/lib/enrichment/fetch.ts` — server-side fetch to user-supplied URLs

**Check for:**
- [ ] **SQL injection**: Supabase JS client parameterizes by default, but check `.or()` string building in items route — is `escapeIlike()` sufficient?
- [ ] **SSRF**: `fetchPage()` fetches any URL the user captures. Can it hit internal services, cloud metadata endpoints (169.254.169.254), or localhost? Is there any URL allowlist/blocklist?
- [ ] **XSS via stored metadata**: titles, descriptions, notes — are they safely rendered in React (auto-escaped) or is there any `dangerouslySetInnerHTML`?
- [ ] **Prototype pollution** via `mergeJsonRecord()` in item PATCH — does `{ ...base, ...p }` allow `__proto__` keys?
- [ ] URL validation — can a `javascript:` or `data:` URL be captured and later rendered as a link?
- [ ] Tag name injection or excessively long inputs (no length limit on tag names?)
- [ ] Note length is capped at 2000 in capture, but is it capped in PATCH?
- [ ] `body.url.trim()` — what if `body.url` is extremely long? Any size limits?

---

### 4. Server-Side Request Forgery (SSRF)

**Files to read:**
- `src/lib/enrichment/fetch.ts` — the `fetchPage()` function
- `src/lib/enrichment/extract.ts` — orchestrates enrichment
- `src/lib/jobs/enrich-item.ts` — enrichment job logic

**Check for:**
- [ ] No URL scheme restriction — can `file://`, `ftp://`, `gopher://` be fetched?
- [ ] No hostname/IP blocklist — can `127.0.0.1`, `0.0.0.0`, `169.254.169.254`, `[::1]`, `metadata.google.internal` be fetched?
- [ ] Redirect following (`redirect: "follow"`) — can an attacker serve a 302 to an internal IP?
- [ ] DNS rebinding — first resolution passes validation, second resolves to internal IP
- [ ] Response size limits — does the enrichment fetch limit response body size or is memory exhaustion possible?
- [ ] Timeout is 8s — is that appropriate?

---

### 5. Row Level Security (RLS) & Database

**Files to read:**
- `supabase/migrations/20260515140000_initial_schema.sql` — full schema + RLS policies
- `supabase/migrations/20260515160000_claim_pending_enrichment.sql` — enrichment RPC
- `supabase/migrations/20260516175257_add_llm_category_source.sql`

**Check for:**
- [ ] All tables have RLS enabled — verify no table is missing `enable row level security`
- [ ] Every table's policies correctly use `auth.uid()` — look for any policy that's too permissive
- [ ] `item_tags` and `collection_items` junction tables — do policies check ownership of both sides?
- [ ] `collection_items_delete` only checks collection ownership, not item ownership — is that intentional? Could user A delete a link between user B's item and collection if UUIDs collide?
- [ ] `claim_pending_enrichment` RPC — does it run as `security definer` or `security invoker`? Can an unauthenticated user call it?
- [ ] Storage policies for `item-images` bucket — folder-based ACL using `auth.uid()::text` as folder name. Verify there's no traversal possible.
- [ ] The `service_role` key bypasses RLS — audit every place `createAdminClient()` is used and ensure the business logic compensates with explicit `user_id` filters

---

### 6. Secrets & Environment Configuration

**Files to read:**
- `.env.local.example` — template for required env vars
- `next.config.ts` — Next.js configuration
- `.gitignore` — ensure secrets are excluded
- `vercel.json` — deployment config
- `package.json` — dependency list

**Check for:**
- [ ] `NEXT_PUBLIC_*` vars — only `SUPABASE_URL` and `SUPABASE_ANON_KEY` should be public. Verify `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `GEMINI_API_KEY`, `QA_DEV_SESSION_SECRET` are NOT prefixed with `NEXT_PUBLIC_`
- [ ] `.env.local` in `.gitignore` — confirmed
- [ ] `next.config.ts` images `remotePatterns` — `hostname: "**"` allows ANY image proxy. Could this be abused for SSRF via Next.js image optimization?
- [ ] Are there any hardcoded secrets, API keys, or tokens in the source code?
- [ ] `extension/manifest.json` — `host_permissions` and `externally_connectable` are limited to `theque.app`. Production URL is `theque.vercel.app`. **Mismatch?**

---

### 7. Chrome Extension Security

**Files to read:**
- `extension/manifest.json` — permissions, host_permissions, externally_connectable
- `extension/popup.ts` (and compiled `popup.js`) — popup logic
- `extension/background.ts` (and compiled `background.js`) — service worker
- `extension/popup.html` — popup UI

**Check for:**
- [ ] Token storage: `chrome.storage.local` for `theque_capture_token` — is this secure enough? Any extension with `storage` permission on the same browser profile could read it?
- [ ] CSP in popup.html — any inline scripts or unsafe-eval?
- [ ] Does the extension validate the API base URL before sending the token? Could a malicious `theque_api_base_url` exfiltrate the capture token?
- [ ] Are error messages in the popup safely rendered (no innerHTML with user data)?
- [ ] `externally_connectable` matches `theque.app` but production is `theque.vercel.app` — potential misconfiguration
- [ ] Minimal permissions — `storage` + `activeTab` is good. Verify no `tabs`, `webRequest`, or broad host permissions

---

### 8. Dependency & Supply Chain

**Check for:**
- [ ] Run `npm audit` in the worktree and report all findings
- [ ] Check if `@supabase/ssr`, `@supabase/supabase-js` versions have known CVEs
- [ ] Evaluate `@google/genai` — is the version current?
- [ ] Any pre/post-install scripts in dependencies that could be malicious?
- [ ] Lock file integrity — is `package-lock.json` committed and consistent?

---

### 9. HTTP Security Headers

**Use the running dev server on port 3001.**

**Check for:**
- [ ] `Content-Security-Policy` — is one set? What directives?
- [ ] `X-Frame-Options` or `frame-ancestors` in CSP — clickjacking protection
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Strict-Transport-Security` (HSTS) — relevant for production
- [ ] `Referrer-Policy`
- [ ] `Permissions-Policy`
- [ ] CORS headers on API routes — are they explicitly set or relying on same-origin?
- [ ] API responses — do error responses leak stack traces or internal details?

---

### 10. Business Logic & Miscellaneous

**Check for:**
- [ ] **Denial of Service**: Can a user create unlimited items, collections, tags, or capture tokens? Any resource limits?
- [ ] **Enrichment abuse**: Can a user trigger unlimited enrichment runs by repeatedly capturing the same URL with slight variations?
- [ ] **Data exposure in error messages**: Do any API routes expose Supabase error details (`error.message`) that could leak schema info?
- [ ] **Cursor/pagination manipulation**: Can crafted cursor values cause issues in the items list endpoint?
- [ ] **Race conditions**: `claim_pending_enrichment` RPC — is it atomic? Can two concurrent cron runs process the same item?
- [ ] **Admin client usage audit**: Every use of `createAdminClient()` bypasses RLS. List all call sites and verify each one compensates with explicit `user_id` filtering.

---

## Report Format

Write the final report to: `docs/security-audit-report.md`

Use this structure:

```markdown
# Security Audit Report — Theque
**Date:** [today's date]
**Auditor:** Claude Opus (automated)
**Scope:** Full application (web, API, DB, extension)
**Commit:** [current HEAD hash]

## Executive Summary
[2-3 paragraph overview of overall security posture, critical findings count]

## Risk Rating Scale
| Rating | Description |
|--------|-------------|
| 🔴 CRITICAL | Exploitable now, data breach or full compromise possible |
| 🟠 HIGH | Significant risk, should fix before production launch |
| 🟡 MEDIUM | Defense-in-depth gap, fix in next sprint |
| 🟢 LOW | Minor hardening opportunity |
| ℹ️ INFO | Observation, no immediate risk |

## Findings

### [FINDING-001] Title
- **Severity:** 🔴/🟠/🟡/🟢/ℹ️
- **Category:** (Auth / IDOR / SSRF / Input Validation / etc.)
- **Location:** `path/to/file.ts:L42`
- **Description:** What the issue is
- **Impact:** What an attacker could achieve
- **Proof of Concept:** Steps to reproduce (if applicable)
- **Recommendation:** How to fix it

[repeat for each finding]

## Checklist Summary
[Table with each audit category, pass/fail/partial status, and finding count]

## Dependency Audit
[npm audit output summary]

## Recommendations Priority
[Ordered list of fixes by severity and effort]
```

## Critical Rules

1. **DO NOT edit any source files.** This is a read-only audit.
2. **DO NOT make any requests to production** (`theque.vercel.app`). Only test against `localhost:3001`.
3. **DO NOT commit anything** to git.
4. **DO NOT** expose or log any secrets from `.env.local`.
5. **Be thorough.** Read every file mentioned. Don't skip a category.
6. **Be precise.** Include file paths and line numbers for every finding.
7. **Distinguish speculation from confirmed issues.** If you can verify something against the running server, do so. If it's a code-review-only finding, say so.

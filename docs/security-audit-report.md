# Security Audit Report — Theque

**Date:** 2026-05-17  
**Auditor:** Claude Opus (automated)  
**Scope:** Full application (web, API, DB, extension)  
**Commit:** `9f3f35f83747c817c4e3b50263047186180ac530`

## Executive Summary

Theque demonstrates a **solid security foundation** for a PoC single-user application. Row Level Security is consistently applied across all tables, session handling follows Supabase best practices, and there are no instances of `dangerouslySetInnerHTML` or `innerHTML` anywhere in the codebase. Secrets are properly separated from public environment variables.

However, the audit identified **19 findings**, including **3 HIGH severity** issues that should be addressed before any broader production use. The most critical findings are: (1) **Server-Side Request Forgery (SSRF)** via the enrichment fetch pipeline with no URL scheme or hostname restrictions, (2) **unrestricted Next.js image proxy** (`hostname: "**"`) enabling SSRF via the image optimization endpoint, and (3) **open redirect vulnerabilities** in the middleware and QA session route. Additionally, there are no rate limits on any endpoint, no resource quotas, and missing HTTP security headers.

The codebase is well-structured with consistent patterns for authentication and authorization checks. The main risks stem from defense-in-depth gaps rather than fundamental architectural flaws.

## Risk Rating Scale

| Rating | Description |
|--------|-------------|
| 🔴 CRITICAL | Exploitable now, data breach or full compromise possible |
| 🟠 HIGH | Significant risk, should fix before production launch |
| 🟡 MEDIUM | Defense-in-depth gap, fix in next sprint |
| 🟢 LOW | Minor hardening opportunity |
| ℹ️ INFO | Observation, no immediate risk |

---

## Findings

### [FINDING-001] SSRF via Enrichment Fetch — No URL Restrictions

- **Severity:** 🟠 HIGH
- **Category:** SSRF
- **Location:** `src/lib/enrichment/fetch.ts:10-34`
- **Description:** `fetchPage()` accepts any URL string and calls `fetch()` with `redirect: "follow"` and zero restrictions. There is no allowlist/blocklist for hostnames, no IP validation, and no URL scheme restriction beyond what the `fetch()` API itself supports.
- **Impact:** An attacker (or the single user themselves, via a crafted captured URL) can cause the server to make requests to:
  - Internal services (`http://127.0.0.1`, `http://[::1]`, `http://0.0.0.0`)
  - Cloud metadata endpoints (`http://169.254.169.254/latest/meta-data/` on AWS, `http://metadata.google.internal/` on GCP)
  - Internal network hosts
  - The redirect-following behavior means even if the initial URL passes validation, a 302 redirect to an internal IP would be followed.
- **Proof of Concept:** Capture a URL pointing to `http://169.254.169.254/latest/meta-data/iam/security-credentials/` — enrichment will fetch it. The URL normalization in `normalize.ts` does validate `http:` or `https:` protocol (line 54), which blocks `file://`, `ftp://`, etc. However, there is no hostname validation.
- **Recommendation:**
  1. Resolve the URL's hostname to an IP before fetching; reject private/reserved IP ranges (RFC 1918, link-local, loopback).
  2. Disable redirect following, or validate each redirect destination.
  3. Consider a response body size limit (currently reads full `res.text()` with no cap).

---

### [FINDING-002] Next.js Image Proxy Allows Any Hostname (SSRF)

- **Severity:** 🟠 HIGH
- **Category:** SSRF / Configuration
- **Location:** `next.config.ts:4-17`
- **Description:** The `images.remotePatterns` configuration uses `hostname: "**"` for both `https` and `http` protocols, allowing Next.js `/_next/image` endpoint to proxy and optimize images from any URL, including internal network hosts.
- **Impact:** An attacker can use `/_next/image?url=http://169.254.169.254/latest/meta-data/&w=64&q=75` to probe internal services through the Next.js image optimization proxy. While the response will be processed as an image (and may fail), error messages or timing differences can leak information.
- **Recommendation:** Restrict `remotePatterns` to known image hosts (e.g., Supabase storage domain, known CDNs) or at minimum block private IP ranges.

---

### [FINDING-003] Open Redirect in Middleware and QA Session Route

- **Severity:** 🟠 HIGH
- **Category:** Auth / Open Redirect
- **Location:** `src/middleware.ts:70-72`, `src/app/api/dev/qa-session/route.ts:26`
- **Description:** Two locations use incomplete redirect sanitization:
  - **Middleware** (line 71): `const dest = next?.startsWith("/") ? next : "/library"` — only checks for leading `/`, does NOT block `//evil.com` (protocol-relative URL) or paths with backslashes.
  - **QA Session** (line 26): `searchParams.get("next")?.startsWith("/") ? searchParams.get("next")! : "/library"` — same issue.
  
  By contrast, `login-utils.ts` and `auth/callback/route.ts` correctly use `sanitizeRedirectPath()` which blocks `//` and `\`.
- **Impact:** If a user is already authenticated and visits `/login?next=//evil.com`, the middleware redirects them to `//evil.com`, which browsers interpret as a protocol-relative URL navigating to `evil.com`. While the QA session route is dev-only, the middleware redirect is always active.
- **Proof of Concept:** Authenticated user visits `http://localhost:3001/login?next=//evil.com` → middleware redirects to `//evil.com`.
- **Recommendation:** Use the existing `sanitizeRedirectPath()` function from `login-utils.ts` in both middleware and QA session route. Consider extracting it to a shared utility.

---

### [FINDING-004] No Rate Limiting on Any Endpoint

- **Severity:** 🟡 MEDIUM
- **Category:** Business Logic / DoS
- **Location:** All API routes
- **Description:** No rate limiting is implemented on any endpoint. This includes:
  - OTP send (`signInWithOtp` on client side — relies entirely on Supabase's built-in rate limiting)
  - Capture endpoint (`POST /api/capture`)
  - Token creation (`POST /api/capture-tokens`)
  - Enrichment retry (`POST /api/items/[id]/retry-enrichment`)
  - AI enrichment proposal (`POST /api/items/[id]/ai-enrichment-proposal`)
  - Cron enrichment (`POST /api/jobs/enrich`)
- **Impact:** Brute-force attacks on OTP (limited by Supabase's own rate limits), resource exhaustion via unlimited item/collection/tag creation, and abuse of the enrichment pipeline (which makes outbound HTTP requests).
- **Recommendation:** Add rate limiting middleware, especially on auth endpoints, capture, and enrichment triggers. Consider Vercel's built-in rate limiting or `@upstash/ratelimit`.

---

### [FINDING-005] PostgREST Filter Injection via Search Query

- **Severity:** 🟡 MEDIUM
- **Category:** Input Validation
- **Location:** `src/app/api/items/route.ts:209-213`
- **Description:** The search query `q` is escaped for ILIKE wildcards (`%`, `_`, `\`) but then interpolated into a `.or()` filter string: `title.ilike.%${esc}%,description.ilike.%${esc}%,...`. PostgREST uses commas as OR-clause separators in this filter string. If the search query contains a comma, it could be interpreted as additional filter conditions.
- **Impact:** In practice, this is **low risk** because: (1) RLS ensures results are always scoped to the authenticated user, (2) injected filter conditions would likely cause parse errors. However, a carefully crafted query could potentially add unexpected filter conditions within the user's own data scope.
- **Recommendation:** Escape or encode commas in the search query, or switch to separate `.ilike()` calls combined with `.or()` array syntax if available in the Supabase JS client version.

---

### [FINDING-006] Missing HTTP Security Headers

- **Severity:** 🟡 MEDIUM
- **Category:** HTTP Headers
- **Location:** `next.config.ts`, no `headers()` configuration
- **Description:** Response headers from the dev server show no security headers:
  - ❌ No `Content-Security-Policy`
  - ❌ No `X-Frame-Options` or `frame-ancestors` CSP directive (clickjacking risk)
  - ❌ No `X-Content-Type-Options: nosniff`
  - ❌ No `Strict-Transport-Security` (HSTS)
  - ❌ No `Referrer-Policy`
  - ❌ No `Permissions-Policy`
  - ⚠️ `X-Powered-By: Next.js` is present (information disclosure)
  
  Headers observed: `Vary`, `Cache-Control: no-cache, must-revalidate`, `Content-Type`, `X-Powered-By: Next.js`.
- **Impact:** Missing CSP allows XSS payloads if a vector is found. Missing frame options allows clickjacking. Missing HSTS allows SSL stripping on production.
- **Recommendation:** Add a `headers()` function in `next.config.ts` to set security headers. Set `poweredByHeader: false` to remove `X-Powered-By`.

---

### [FINDING-007] Prototype Pollution Risk in mergeJsonRecord

- **Severity:** 🟡 MEDIUM
- **Category:** Input Validation
- **Location:** `src/app/api/items/[id]/route.ts:20-30`
- **Description:** `mergeJsonRecord()` spreads user-supplied patch data: `{ ...base, ...p }`. If `p` contains `__proto__` or `constructor` keys, the spread operator in modern JS engines does NOT trigger prototype pollution (spread copies own enumerable properties, `__proto__` as a key name is safe with spread). However, the merged result is stored in the database and could be used in downstream contexts.
- **Impact:** **Low practical risk** in current V8/Node.js behavior — the spread operator is safe against `__proto__` prototype pollution. The data is stored as JSONB in Postgres and returned as JSON. No downstream code iterates over these keys in an unsafe way.
- **Recommendation:** For defense-in-depth, strip `__proto__`, `constructor`, and `prototype` keys from user-supplied patch objects before merging.

---

### [FINDING-008] No Note Length Validation in PATCH Item

- **Severity:** 🟡 MEDIUM
- **Category:** Input Validation
- **Location:** `src/app/api/items/[id]/route.ts:96-98`
- **Description:** The capture route validates note length (max 2000 chars, line 57), but the PATCH route for updating items accepts `body.note` as a string with no length limit.
- **Impact:** A user could update an item's note to an arbitrarily long string, potentially causing storage issues or UI rendering problems.
- **Recommendation:** Add `body.note.length > 2000` validation in the PATCH handler, consistent with the capture route.

---

### [FINDING-009] No Input Length Limits on Tags, Collection Names, Titles

- **Severity:** 🟡 MEDIUM
- **Category:** Input Validation
- **Location:** Multiple: `src/app/api/capture/route.ts`, `src/app/api/items/[id]/route.ts`, `src/app/api/collections/route.ts`
- **Description:** No maximum length is enforced on:
  - Tag names (capture route line 28, item PATCH line 132)
  - Collection names/descriptions (collections route line 52)
  - Item titles (item PATCH line 101)
  - Captured URL length (`body.url.trim()` with no size cap)
  - Number of tags per item or collections per item
- **Impact:** Resource exhaustion via extremely long strings or unlimited array sizes. Database column limits (if any) would be the only defense.
- **Recommendation:** Add reasonable length limits on all text inputs and array sizes.

---

### [FINDING-010] Error Responses Expose Supabase Error Messages

- **Severity:** 🟡 MEDIUM
- **Category:** Information Disclosure
- **Location:** 10+ API routes (see grep results for `error.message`)
- **Description:** Many API error responses include `detail: error.message` which exposes raw Supabase/PostgreSQL error messages. Examples:
  - `{ code: "query_failed", detail: error.message }` (items/route.ts:220)
  - `{ code: "insert_failed", detail: error.message }` (capture/route.ts:139)
  - `{ code: "tag_failed", detail: tagErr?.message }` (items/[id]/route.ts:145)
- **Impact:** Error messages from Supabase can expose table names, column names, constraint names, and PostgreSQL internal details that aid further attacks.
- **Recommendation:** Log full error details server-side, return generic error messages to the client. Use error codes rather than raw messages.

---

### [FINDING-011] collection_items_delete RLS Only Checks Collection Ownership

- **Severity:** 🟢 LOW
- **Category:** RLS / Database
- **Location:** `supabase/migrations/20260515140000_initial_schema.sql:293-300`
- **Description:** The `collection_items_delete` policy only checks that the collection belongs to the authenticated user, not that the item also belongs to them. Compare with `collection_items_insert` and `collection_items_select` which check BOTH sides.
- **Impact:** **Negligible in single-user context.** In a multi-tenant scenario, this would allow a user who owns a collection to delete the link between that collection and another user's item — but only if the junction row existed (which `collection_items_insert` prevents from being created cross-user). The risk is theoretical.
- **Recommendation:** Add an item ownership check to the delete policy for consistency and defense-in-depth.

---

### [FINDING-012] claim_pending_enrichment RPC is SECURITY DEFINER

- **Severity:** 🟢 LOW
- **Category:** Database
- **Location:** `supabase/migrations/20260515160000_claim_pending_enrichment.sql:5-27`
- **Description:** The `claim_pending_enrichment_items` RPC runs as `SECURITY DEFINER`, bypassing RLS. It is correctly restricted: `REVOKE ALL ... FROM public` and `GRANT EXECUTE ... TO service_role` only. Anonymous or authenticated users cannot call it.
- **Impact:** No exploitable risk — properly locked down.
- **Recommendation:** ✅ Well implemented. The `FOR UPDATE SKIP LOCKED` prevents race conditions between concurrent cron runs.

---

### [FINDING-013] QA Session Route NODE_ENV Check

- **Severity:** 🟢 LOW
- **Category:** Auth
- **Location:** `src/app/api/dev/qa-session/route.ts:8-12`
- **Description:** The route is gated by `process.env.NODE_ENV !== "development"` (line 9) AND `process.env.VERCEL_ENV === "production"` (line 10). In Next.js production builds, `NODE_ENV` is always `"production"`, so line 9 returns `false`, making `isDevQaEnabled()` return `false`. Additionally, line 10 explicitly blocks `VERCEL_ENV === "production"`. The secret comparison on line 22 uses simple `===` (not timing-safe), but this is acceptable since the route is unreachable in production.
- **Impact:** ✅ Properly gated. Cannot be reached in production deployments.
- **Recommendation:** No action needed.

---

### [FINDING-014] Capture Token Entropy and Hash Lookup

- **Severity:** 🟢 LOW
- **Category:** Auth
- **Location:** `src/lib/auth/capture-token.ts:11-22, 25-46`
- **Description:** Tokens use `randomBytes(24)` → base64url = 32 chars of entropy (192 bits). The lookup uses SHA-256 hash comparison via database `.eq("token_hash", hash)`, not timing-safe comparison. However, since the comparison happens in PostgreSQL (not in application code), and the hash is a one-way function, timing attacks against the hash comparison are impractical.
- **Impact:** 192 bits of entropy is more than sufficient. Hash-based lookup is secure — the attacker would need to find a SHA-256 preimage. Revoked tokens are correctly filtered (`data.revoked_at` check on line 39).
- **Recommendation:** ✅ Acceptable design. Token entropy is adequate.

---

### [FINDING-015] Chrome Extension Domain Mismatch

- **Severity:** 🟢 LOW
- **Category:** Extension Security
- **Location:** `extension/manifest.json:12-14`
- **Description:** `host_permissions` and `externally_connectable` are set to `https://theque.app/*`, but the production URL is `https://theque.vercel.app`. This means:
  1. The extension cannot make requests to `theque.vercel.app` via host permissions (but it uses `fetch()` which doesn't require host permissions for the capture API).
  2. `externally_connectable` from `theque.vercel.app` won't match, so `chrome.runtime.sendMessage` from the web app to the extension won't work on the production domain.
- **Impact:** The extension connect flow (sending capture token from web app to extension via `chrome.runtime.sendMessage`) will not work in production because `theque.vercel.app` doesn't match the `externally_connectable` pattern. However, the background.ts `isValidConnectMessage` function does validate that the `baseUrl` origin matches the sender origin, which is a good security measure.
- **Recommendation:** Update `manifest.json` to include the actual production domain `theque.vercel.app` (or configure a custom domain `theque.app`).

---

### [FINDING-016] No Resource Quotas (DoS via Unlimited Creation)

- **Severity:** 🟢 LOW
- **Category:** Business Logic
- **Location:** All creation endpoints
- **Description:** There are no limits on the number of items, collections, tags, or capture tokens a user can create. A malicious or compromised account could create millions of rows.
- **Impact:** Database storage exhaustion, performance degradation. Mitigated by single-user design (the user would only be harming themselves).
- **Recommendation:** Add per-user quotas or use database constraints.

---

### [FINDING-017] CRON_SECRET Comparison Not Timing-Safe

- **Severity:** 🟢 LOW
- **Category:** Auth
- **Location:** `src/app/api/jobs/enrich/route.ts:7-11`
- **Description:** `bearer !== secret` uses JavaScript `!==` which is not timing-safe. This could theoretically allow timing attacks to determine the secret character by character.
- **Impact:** Very low practical risk — network jitter makes remote timing attacks on string comparison extremely difficult. The secret is also only used server-to-server (cron to API).
- **Recommendation:** Use `crypto.timingSafeEqual()` for defense-in-depth.

---

### [FINDING-018] Admin Client Usage Audit

- **Severity:** ℹ️ INFO
- **Category:** Auth / Access Control
- **Description:** `createAdminClient()` (bypasses RLS) is used in 5 locations:

| Location | Purpose | User-ID Scoped? |
|----------|---------|-----------------|
| `capture-token.ts:31` | Lookup token hash, update `last_used_at` | ✅ Hash is globally unique; subsequent ops use returned `user_id` |
| `capture/route.ts:89` | Dedup, insert, upsert tags, link tags/collections | ✅ All queries include `.eq("user_id", userId)` |
| `items/[id]/route.ts:129` | Tag and collection ops in PATCH | ✅ Item ownership verified first; upserts include `user_id` |
| `jobs/enrich/route.ts:13` | Claim pending enrichment via RPC | ✅ RPC is service_role only |
| `enrich-item.ts:95` | Read/update item during enrichment | ⚠️ No user_id filter — by design (processes all pending items) |
| `dev/qa-session/route.ts:41` | Generate magic link for QA user | ✅ Dev-only route |

- **Impact:** All admin client usages are properly scoped or intentionally cross-user (enrichment). No IDOR risk identified.

---

### [FINDING-019] .cursor Directory Not in .gitignore

- **Severity:** ℹ️ INFO
- **Category:** Secrets / Configuration
- **Location:** `.gitignore`
- **Description:** The AGENTS.md states `.cursor/` is gitignored, but it is not listed in `.gitignore` and `git check-ignore .cursor` confirms it's NOT ignored. If `.cursor/mcp.json` contains sensitive configuration (e.g., API tokens for MCP servers), it could be accidentally committed.
- **Recommendation:** Add `.cursor/` to `.gitignore`.

---

## Checklist Summary

| Category | Status | Findings |
|----------|--------|----------|
| 1. Authentication & Session Management | ⚠️ Partial | 2 (open redirect, QA route OK) |
| 2. API Route Authorization (IDOR) | ✅ Pass | 0 (all routes properly scoped) |
| 3. Input Validation & Injection | ⚠️ Partial | 4 (filter injection, note length, no limits, error exposure) |
| 4. SSRF | ❌ Fail | 2 (fetch + image proxy) |
| 5. RLS & Database | ✅ Pass | 1 minor (collection_items_delete) |
| 6. Secrets & Environment | ✅ Pass | 1 info (.cursor gitignore) |
| 7. Chrome Extension Security | ⚠️ Partial | 1 (domain mismatch) |
| 8. Dependency & Supply Chain | ✅ Pass | 0 critical (3 moderate) |
| 9. HTTP Security Headers | ❌ Fail | 1 (no security headers at all) |
| 10. Business Logic | ⚠️ Partial | 2 (no rate limits, no quotas) |

## Dependency Audit

```
npm audit — 3 moderate severity vulnerabilities

1. postcss < 8.5.10
   - XSS via unescaped </style> in CSS stringify output
   - GHSA-qx2v-qp2m-jg93 (CVSS 6.1)
   - Transitive dep via next@16.2.6

2. next 9.3.4-canary.0 – 16.3.0-canary.5
   - Affected by postcss vulnerability above

3. @vercel/analytics >= 1.2.0-beta.1
   - Affected transitively via next
```

No high or critical vulnerabilities. Lock file (`package-lock.json`) is committed and tracked.

**Key dependency versions:**
- `next`: 16.2.6 — current
- `@supabase/ssr`: 0.10.3 — current
- `@supabase/supabase-js`: 2.105.4 — current
- `@google/genai`: 2.3.0 — current
- `jsdom`: 26.0.0 (devDep, used in enrichment) — current

## Recommendations Priority

| Priority | Finding | Effort | Action |
|----------|---------|--------|--------|
| 1 | FINDING-001: SSRF in fetchPage | Medium | Add hostname/IP validation, block private ranges, limit response size |
| 2 | FINDING-002: Image proxy wildcard | Low | Restrict `remotePatterns` to known hosts |
| 3 | FINDING-003: Open redirect | Low | Use `sanitizeRedirectPath()` in middleware and QA route |
| 4 | FINDING-006: Missing security headers | Low | Add `headers()` config in next.config.ts |
| 5 | FINDING-004: No rate limiting | Medium | Add rate limiting on auth, capture, enrichment endpoints |
| 6 | FINDING-010: Error message exposure | Low | Sanitize error responses, log details server-side only |
| 7 | FINDING-005: Filter injection | Low | Escape commas in search query |
| 8 | FINDING-008: Note length in PATCH | Low | Add 2000-char limit |
| 9 | FINDING-009: Input length limits | Low | Add length constraints |
| 10 | FINDING-015: Extension domain | Low | Update manifest.json domains |

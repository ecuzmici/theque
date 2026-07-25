# Theque — API Contract

Base URL: `https://<app-domain>` (local: `http://localhost:3000`)

All JSON request/response bodies use `Content-Type: application/json`.

## Authentication

### Web app (session)

- Supabase session via `@supabase/ssr` cookies
- Server routes call `createClient()` and `getUser()` — reject if no user

### Capture clients (token)

```
Authorization: Bearer bmly_<secret>
```

- Token validated against `capture_tokens.token_hash`
- Updates `last_used_at`
- Rejects revoked tokens (`revoked_at` not null)
- No app-level rate limiter is currently implemented; rely on Supabase/Vercel controls and keep capture tokens private.

## Endpoints

### `POST /api/capture`

Create or return existing item. **Must respond in <500ms** — enqueue enrichment async.

**Auth:** Capture token OR session

**Request**

```json
{
  "url": "https://www.goodreads.com/book/show/123",
  "note": "optional",
  "category_hint": "books",
  "source": "ios_shortcut"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `url` | yes | Must be `http` or `https` |
| `note` | no | Max 2000 chars |
| `category_hint` | no | Optional enrichment signal from capture clients (e.g. Chrome extension shelf picker). Accepted values extension hint subset: `books`, `movies_and_tv`, `restaurants`, `products`, `travel`, `articles`, `recipes`. Not a manual category override (`PATCH /api/items/:id` is). |
| `source` | yes | Enum `item_source` |

Legacy fields: `tag_names` and `collection_ids` are still **accepted and ignored** (no validation, no writes) for Web Store 1.0.0 extension compatibility — tags and collections were removed from the product.

Duplicate URLs: the handler resolves an existing item and returns **`200`** with `created: false` **before** optional hints influence the outcome, so **`category_hint` is not validated for duplicate captures** — an invalid hint does **not** change the duplicate response into an error.

**Response `201` (new)**

```json
{
  "created": true,
  "item": {
    "id": "uuid",
    "url": "...",
    "canonical_url": "...",
    "domain": "www.goodreads.com",
    "title": null,
    "subtitle": null,
    "description": null,
    "image_url": null,
    "category": null,
    "category_confidence": null,
    "status": "inbox",
    "processing_status": "pending",
    "source": "ios_shortcut",
    "note": "optional",
    "created_at": "ISO8601"
  }
}
```

**Response `200` (duplicate)**

Same shape with `"created": false` and existing item fields.

**Errors**

| Status | Code | When |
|--------|------|------|
| 400 | `invalid_url` | Malformed URL |
| 400 | `invalid_source` | `source` missing or not an `item_source` value |
| 400 | `invalid_note` | `note` is not a string or exceeds 2000 chars |
| 400 | `invalid_category_hint` | `category_hint` present but not one of `books`, `movies_and_tv`, `restaurants`, `products`, `travel`, `articles`, `recipes` (skipped for duplicates; see above) |
| 401 | `unauthorized` | Missing/invalid auth |
| 500 | `insert_failed` | Server/database write failure |

---

### `GET /api/items`

List items for authenticated user.

**Auth:** Session only (not capture token)

**Query**

| Param | Type | Notes |
|-------|------|-------|
| `status` | string | Comma-separated statuses |
| `category` | string | Comma-separated categories |
| `q` | string | Search title, description, domain, note; max 200 chars |
| `processing_status` | string | Filter pipeline state |
| `cursor` | string | Opaque pagination cursor |
| `limit` | int | Default 24, max 100 |

**Response `200`**

```json
{
  "items": [ { /* ItemSummary */ } ],
  "next_cursor": "string|null"
}
```

**ItemSummary**

```json
{
  "id": "uuid",
  "title": "string|null",
  "subtitle": "string|null",
  "image_url": "string|null",
  "domain": "string",
  "category": "books|null",
  "status": "want",
  "processing_status": "ready",
  "canonical_url": "string",
  "created_at": "ISO8601",
  "display": { "card_aspect": "2/3" }
}
```

---

### `GET /api/items/:id`

**Auth:** Session

**Response `200`**

Full item object including `structured`, `raw_metadata`, `display`, `note`.

**Errors:** `404` if not found or not owned

---

### `PATCH /api/items/:id`

**Auth:** Session

**Request** (partial)

```json
{
  "status": "want",
  "category": "books",
  "note": "updated",
  "title": "override",
  "display": { "card_aspect": "2/3" }
}
```

Setting `category` sets `category_source` to `manual` and `category_confidence` to `1`; setting `category` to `null` clears category fields. `note` is max 2000 chars and `title` is max 300 chars. `display` is merged into existing JSON after filtering prototype-pollution keys.

**Response `200`:** Updated item

---

### `DELETE /api/items/:id`

**Auth:** Session

Hard delete item and join rows.

**Response `204`**

---

### `POST /api/items/:id/retry-enrichment`

**Auth:** Session

Reset `processing_status` to `pending`, `enrichment_attempts` to 0. Enqueue job.

**Response `202`**

```json
{ "item_id": "uuid", "processing_status": "pending" }
```

---

### `POST /api/items/:id/ai-enrichment-proposal`

**Auth:** Session

Calls Gemini to propose a reviewed metadata rewrite for one item. The proposal is returned to the UI and is not written until accepted.

**Response `200`**

```json
{
  "item_id": "uuid",
  "proposal": {
    "category": "books",
    "category_confidence": 0.93,
    "title": "A Drop of Corruption",
    "subtitle": null,
    "description": "A detective fantasy sequel.",
    "image_url": "https://...",
    "structured": { "authors": ["Robert Jackson Bennett"] },
    "confidence": 0.88,
    "sources": ["url"],
    "notes": "Amazon Kindle listing"
  },
  "proposal_metadata": {
    "provider": "gemini",
    "model": "gemini-2.5-flash"
  }
}
```

**Errors:** `401`, `404`, `503` for skipped/unavailable Gemini configuration, `502 proposal_failed`.

---

### `POST /api/items/:id/ai-enrichment-apply`

**Auth:** Session

Validates and applies a proposal returned by `ai-enrichment-proposal`. Writes accepted metadata, marks the item `ready`, and records review metadata in `raw_metadata.ai_review`.

**Request**

```json
{
  "proposal": { "category": "books", "...": "same shape as proposal response" },
  "proposal_metadata": { "provider": "gemini", "model": "gemini-2.5-flash" }
}
```

**Response `200`:** Updated full item object.

---

### `GET /api/capture-tokens`

**Auth:** Session

Lists capture tokens for the current user, including `token_prefix`, `created_at`, `last_used_at`, and `revoked_at`. Plaintext token secrets are never returned after creation.

---

### `POST /api/capture-tokens`

**Auth:** Session

```json
{ "name": "iPhone Shortcut" }
```

**Response `201`**

```json
{
  "id": "uuid",
  "name": "iPhone Shortcut",
  "token": "bmly_....",
  "token_prefix": "bmly_ab",
  "created_at": "ISO8601"
}
```

`token` shown **once**.

---

### `DELETE /api/capture-tokens/:id`

**Auth:** Session — sets `revoked_at`

---

### `POST /api/import/parse`

**Auth:** Session. `multipart/form-data` with a single `file` field, max 4 MB.

Server-side parse for the formats the browser cannot read itself: bookmark and
Pocket HTML (jsdom) and archives (raw bytes). CSV/TSV/plain-URL files are parsed
in the browser and never uploaded. Read-only — nothing is written.

**Response `200`**

```json
{
  "importer": { "id": "pocket-html", "label": "Pocket (HTML export)" },
  "rows": [{ "url": "https://example.com/a", "title": "A", "source_ref": {} }],
  "skipped": [{ "line": 12, "reason": "missing_url" }],
  "warnings": []
}
```

Errors: `401 unauthorized`, `400 missing_file`, `413 file_too_large`,
`422 unrecognized_file` / `parse_failed`, `429 rate_limited` (10/60s per user).

---

### `POST /api/import`

**Auth:** Session. One chunk of an already-parsed import file (`ImportRow[]`,
max 500 per request; the UI sends 250). Rate limited to 40 requests/60s per user
on its own bucket — this is deliberately **not** a loop over `/api/capture`.

**Request**

```json
{
  "importer": "pocket-csv",
  "rows": [
    {
      "url": "https://example.com/a",
      "title": "A",
      "category": "articles",
      "status": "done",
      "rating_personal": 4,
      "verdict": "worth it",
      "done_at": "2026-01-04T00:00:00.000Z",
      "source_ref": { "importer": "pocket-csv", "line": 12 }
    }
  ]
}
```

Rows are inserted with `source = 'import'` and `processing_status = 'pending'`,
so they render immediately from the file's own data while enrichment backfills
covers and structured fields. `verdict` is encrypted at rest (ADR 0013). Dedup
is the `unique (user_id, url_fingerprint)` constraint via on-conflict-do-nothing,
so re-posting the same file is a no-op.

**Response `200`**

```json
{
  "inserted": 240,
  "duplicates": 8,
  "failed": 0,
  "rejected": [{ "line": 12, "reason": "invalid_url", "raw": "not a url" }],
  "remaining_quota": 9752
}
```

Errors: `401 unauthorized`, `400 invalid_body` / `batch_too_large`,
`409 quota_exceeded` (at `MAX_ITEMS_PER_USER`), `429 rate_limited`,
`503 import_source_unavailable` when the `import` value is missing from the
`item_source` enum (migration `20260725160000_item_source_import.sql`).

---

### `GET|POST /api/jobs/enrich`

**Auth:** Cron secret header `Authorization: Bearer <CRON_SECRET>`

Claims up to 10 `pending` items, processes sequentially.

**Response `200`**

```json
{ "processed": 3, "failed": 1 }
```

Returns `401 unauthorized` without the configured secret.

## Internal: enrichment job

Not HTTP — called from cron or fire-and-forget after capture.

```
enrichItem(itemId: string): Promise<"ready" | "pending_retry" | "failed" | "skipped">
```

1. Set `processing_status = processing`
2. Fetch URL metadata
3. Extract OG/schema.org metadata and parser-specific fields
4. Classify with domain/schema/heuristics plus any capture hint
5. Optionally call Gemini when `LLM_ENRICHMENT_ENABLED=true` and eligibility allows it
6. Set fields + `processing_status = ready` or `failed`
7. Increment `enrichment_attempts` on failure; stop after 3

## CORS

- Web app: same origin
- Chrome extension: allow extension origin in middleware if needed; extension may call from background without CORS for same host API
- iOS Shortcut: no CORS (native HTTP)

## TypeScript types

Shared in `src/lib/types/api.ts` — keep in sync with this document.

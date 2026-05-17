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
  "tag_names": ["sci-fi"],
  "collection_ids": ["uuid"],
  "source": "ios_shortcut"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `url` | yes | Must be `http` or `https` |
| `note` | no | Max 2000 chars |
| `category_hint` | no | Optional enrichment signal from capture clients (e.g. Chrome extension shelf picker). Accepted values extension hint subset: `books`, `movies_and_tv`, `restaurants`, `products`, `travel`, `articles`, `recipes`. Not a manual category override (`PATCH /api/items/:id` is). |
| `tag_names` | no | Max 50; created if missing; normalized lowercase; each tag max 64 chars |
| `collection_ids` | no | Max 100; must belong to user |
| `source` | yes | Enum `item_source` |

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
| 400 | `invalid_tags` | `tag_names` is malformed, too long, or has too many entries |
| 400 | `invalid_collections` | `collection_ids` is malformed or has too many entries |
| 400 | `invalid_category_hint` | `category_hint` present but not one of `books`, `movies_and_tv`, `restaurants`, `products`, `travel`, `articles`, `recipes` (skipped for duplicates; see above) |
| 401 | `unauthorized` | Missing/invalid auth |
| 403 | `forbidden` | Collection not owned |
| 500 | `insert_failed`, `tag_failed`, `tag_link_failed`, `collection_link_failed` | Server/database write failure |

---

### `GET /api/items`

List items for authenticated user.

**Auth:** Session only (not capture token)

**Query**

| Param | Type | Notes |
|-------|------|-------|
| `status` | string | Comma-separated statuses |
| `category` | string | Comma-separated categories |
| `collection_id` | uuid | Items in collection |
| `tag` | string | Tag name |
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
  "tags": ["sci-fi"],
  "collection_ids": ["uuid"],
  "display": { "card_aspect": "2/3" }
}
```

---

### `GET /api/items/:id`

**Auth:** Session

**Response `200`**

Full item object including `structured`, `raw_metadata`, `display`, `note`, tags, collections.

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
  "display": { "card_aspect": "2/3" },
  "tag_names": ["fiction"],
  "collection_ids": ["uuid"]
}
```

Setting `category` sets `category_source` to `manual` and `category_confidence` to `1`; setting `category` to `null` clears category fields. `note` is max 2000 chars, `title` is max 300 chars, `tag_names` is max 50 entries, and `collection_ids` is max 100 entries. `display` is merged into existing JSON after filtering prototype-pollution keys.

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

**Response `200`:** Updated full item object including tags and collections.

---

### `GET /api/collections`

**Auth:** Session

List user collections with item counts.

---

### `POST /api/collections`

**Auth:** Session

```json
{ "name": "Japan 2026", "description": "optional" }
```

---

### `PATCH /api/collections/:id`

**Auth:** Session

---

### `DELETE /api/collections/:id`

**Auth:** Session — removes join rows

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

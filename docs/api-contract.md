# Bookmarkly — API Contract

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
- Rate limit: 60 requests/minute per token (implement in middleware)

## Endpoints

### `POST /api/capture`

Create or return existing item. **Must respond in <500ms** — enqueue enrichment async.

**Auth:** Capture token OR session

**Request**

```json
{
  "url": "https://www.goodreads.com/book/show/123",
  "note": "optional",
  "tag_names": ["sci-fi"],
  "collection_ids": ["uuid"],
  "source": "ios_shortcut"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `url` | yes | Must be `http` or `https` |
| `note` | no | Max 2000 chars |
| `tag_names` | no | Created if missing; normalized lowercase |
| `collection_ids` | no | Must belong to user |
| `source` | yes | Enum `item_source` |

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
| 401 | `unauthorized` | Missing/invalid auth |
| 403 | `forbidden` | Collection not owned |
| 429 | `rate_limited` | Too many requests |

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
| `q` | string | Search title, description, domain |
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
  "collection_ids": ["uuid"]
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

Setting `category` sets `category_source` to `manual` and `category_confidence` to `1`.

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

### `POST /api/jobs/enrich`

**Auth:** Cron secret header `Authorization: Bearer <CRON_SECRET>` OR internal only

Claims up to 10 `pending` items, processes sequentially.

**Response `200`**

```json
{ "processed": 3, "failed": 1 }
```

Not exposed publicly in production without secret.

## Internal: enrichment job

Not HTTP — called from cron or fire-and-forget after capture.

```
enrichItem(itemId: string): Promise<void>
```

1. Set `processing_status = processing`
2. Fetch URL metadata
3. Classify
4. Set fields + `processing_status = ready` or `failed`
5. Increment `enrichment_attempts` on failure; stop after 3

## CORS

- Web app: same origin
- Chrome extension: allow extension origin in middleware if needed; extension may call from background without CORS for same host API
- iOS Shortcut: no CORS (native HTTP)

## TypeScript types

Shared in `src/lib/types/api.ts` — keep in sync with this document.

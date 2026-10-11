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
| `shelf` | string | Shelf id (`all`, `books`, `watch`, `articles`, `other`, `inbox`). Uses the shelf filter from `src/lib/shelves.ts`, page size 24 |
| `sort` | string | With `shelf`: `recent` (default), `color`, or `title` |
| `offset` | int | Row offset. It wins over `cursor` |
| `status` | string | Comma-separated statuses |
| `category` | string | Comma-separated categories |
| `q` | string | Prefix search over title, subtitle, description, and domain (`simple` index). The note is not searchable. Max 200 chars |
| `processing_status` | string | Filter pipeline state |
| `cursor` | string | Opaque pagination cursor |
| `limit` | int | Default 24, max 100 |

`note` and `verdict` in the response are decrypted (ADR 0013).

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

### `GET /api/items/random`

A random item that is still wanted, for "Tonight's pick".

**Auth:** Session

**Query:** `shelf` (shelf id).

**Response `200`:** `{ "item": LibraryItem | null }`. `400 unknown_shelf` for an unknown shelf.

---

### `GET /api/items/check-url`

Duplicate lookup before a capture. The server normalizes the URL with the capture rules.

**Auth:** Session

**Query:** `url` (required).

**Response `200`:** `{ "existing": { "id", "title", "domain", "status", "created_at" } | null }`.
`400 invalid_url` for a missing, too long, or non-http(s) URL.

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

### `POST /api/items/:id/file`

Upload a book file (EPUB) for the Kobo feature. The server writes the item metadata into
the file, converts it to KEPUB, uploads it to Google Drive, and records the five `file_*`
columns.

**Auth:** Session. Only the accounts in `BOOK_FILE_USER_IDS` (see
`src/lib/book-file-access.ts`). Other accounts get `404 not_found`.

**Body:** `multipart/form-data` with the field `file`. Max 30 MB. Max 20 uploads per hour.

**Response `200`:** `{ "file": { "name", "bytes", "uploaded_at" } }`.

**Errors** (`{ "error": "<code>" }`): `401 unauthorized`, `404 not_found`, `400 missing_file`,
`413 file_too_large`, `422 invalid_epub`, `422 conversion_failed`, `429 rate_limited`,
`502 upload_failed`, `503 drive_not_configured`.

### `DELETE /api/items/:id/file`

Remove the book file from Drive and clear the `file_*` columns.

**Auth:** Same as the upload.

**Response `200`:** `{ "file": null }`. `502 delete_failed` keeps the columns, so a second
request can retry.

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

Calls an LLM through the AI Gateway to propose a reviewed metadata rewrite for one item. The proposal is returned to the UI and is not written until accepted.

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
    "provider": "ai_gateway",
    "model": "openai/gpt-6-luna"
  }
}
```

**Errors:** `401`, `404`, `503` for skipped/unavailable AI Gateway configuration, `502 proposal_failed`.

---

### `POST /api/items/:id/ai-enrichment-apply`

**Auth:** Session

Validates and applies a proposal returned by `ai-enrichment-proposal`. Writes accepted metadata, marks the item `ready`, and records review metadata in `raw_metadata.ai_review`.

**Request**

```json
{
  "proposal": { "category": "books", "...": "same shape as proposal response" },
  "proposal_metadata": { "provider": "ai_gateway", "model": "openai/gpt-6-luna" }
}
```

**Response `200`:** Updated full item object.

---

### `POST /api/recommend`

Build a "Made for you" deck from the user's own library and ratings.

**Auth:** Session

**Body:** `{ "shelfId": "books" | "watch" }`. A body with `items` is rejected: the server
builds the taste profile.

**Response `200`:** `{ "cards": ResolvedRecommendation[], "reason"?: string }`. `reason` is
present only when `cards` is empty. Each card has an `outcome_id`. The server writes one
`recommendation_outcomes` row (`shown`) per card.

**Errors** (`{ "error": "<text>" }`): `400` for a bad body, `429` after the daily limit
(`Retry-After` in seconds), `503` when recommendations are not configured.

### `POST /api/recommend/outcomes`

Record what the user did with a card.

**Auth:** Session

**Body:** `{ "outcomeId": "uuid", "outcome": "saved" | "dismissed", "dismissReason"?: "not_my_thing" | "already_seen" | "not_right_now" }`

---

### `POST /api/account/delete`

Delete the account. The server removes the cover objects and the Drive book files, then
deletes the auth user. The FK cascade removes every row of the user.

**Auth:** Session. The route reads the user id from the session, never from the body.

**Body:** `{ "confirm": "delete" }`

**Response `200`:** `{ "deleted": true, "orphanedFileCount": 0, "orphanedDriveFileCount": 0 }`.
The counts report files that the purge could not remove. `400 invalid_confirmation`,
`500 delete_failed`.

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

### `GET|POST /api/jobs/digest`

Compose the "saved and forgot" digest: the 5 oldest `want` items, saved 30 or more days ago.
No cron runs it.

**Auth:** `Authorization: Bearer <CRON_SECRET>`

**Config:** `DIGEST_USER_ID` names the one account to read. Without it the route answers
`503 { "code": "digest_not_configured" }`. With `RESEND_API_KEY` and `DIGEST_EMAIL_TO` it
sends the email (`{ "sent": true, "items": n }`). Otherwise it returns the HTML.

---

## Internal: enrichment job

Not HTTP — called from cron or fire-and-forget after capture.

```
enrichItem(itemId: string): Promise<"ready" | "pending_retry" | "failed" | "skipped">
```

1. Set `processing_status = processing`
2. Fetch URL metadata
3. Extract OG/schema.org metadata and parser-specific fields
4. Classify with domain/schema/heuristics plus any capture hint
5. Optionally call an LLM through the AI Gateway when `LLM_ENRICHMENT_ENABLED=true` and eligibility allows it
6. Set fields + `processing_status = ready` or `failed`
7. Increment `enrichment_attempts` on failure; stop after 3

## CORS

- Web app: same origin
- Chrome extension: allow extension origin in middleware if needed; extension may call from background without CORS for same host API
- iOS Shortcut: no CORS (native HTTP)

## TypeScript types

Shared in `src/lib/types/api.ts` — keep in sync with this document.

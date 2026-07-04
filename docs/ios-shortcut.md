# Theque — iOS Shortcut (Share sheet)

Send URLs from Safari or any app’s Share sheet to **`POST /api/capture`** using your personal Bearer token. Auth matches [`docs/api-contract.md`](./api-contract.md). Production captures should use `https://theque.app/api/capture`.

## Prerequisites

- **Shortcut app** on iPhone or iPad.
- A capture token created in thèque (**Settings → Capture tokens**). You only see the full secret once — store it in **Shortcuts → … → Sensitive data** or equivalent (never commit tokens).

## Configure once

Create a Shortcut named **Theque capture** with:

1. **Receive** — turn on **Show in Share Sheet**, accepted types **URLs** (and optionally **Rich text** if you want to paste URLs manually).
2. **URL** — set to your deployed API endpoint:  
   `https://theque.app/api/capture`<br>
   For local testing on the same Wi‑Fi you’d need a tunnel (e.g. ngrok); Shortcuts cannot reach `localhost` on your Mac directly.

Optional: add a **Dictionary** or **Ask Each Time** step for:

- **note** — optional string (max 2000 characters).
- **category_hint** — optional category hint (`books`, `movies_and_tv`, `restaurants`, `products`, `travel`, `articles`, or `recipes`).
- **tag_names** — optional list of strings (normalized lowercase server-side).

## Shortcut steps (recommended layout)

1. **Receive URLs** from Share Sheet (input may be `URLs` list — take **first item** if multiple).
2. **Get URLs from Input** (if needed so you always have one URL string).
3. **Get Contents of URL**
   - **Method:** POST  
   - **URL:** `https://YOUR_DOMAIN/api/capture`  
   - **Headers:**
     - `Content-Type` = `application/json`
     - `Authorization` = `Bearer ` + your token **including** the `bmly_` prefix  
       Example header value: `Bearer bmly_xxxxxxxx`
   - **Request Body:** JSON (see below)

## Example JSON body

Minimal:

```json
{
  "url": "https://www.goodreads.com/book/show/123",
  "source": "ios_shortcut"
}
```

With optional fields:

```json
{
  "url": "https://www.goodreads.com/book/show/123",
  "note": "Borrow from library",
  "category_hint": "books",
  "source": "ios_shortcut"
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `url` | yes | Must be `http` or `https`. |
| `source` | yes | Use **`ios_shortcut`** for this flow. |
| `note` | no | Max 2000 chars. |
| `category_hint` | no | Enrichment hint only; deterministic classification can still override it. |

(`tag_names` / `collection_ids` from older Shortcut recipes are accepted and ignored — tags and collections were removed from the product.)

The Shortcut editor’s **Dictionary → JSON** action can build this object; map **Shortcut Input** into the `url` field.

## Responses

- **201** — new item (`created: true`).
- **200** — duplicate fingerprint (`created: false`).
- See [`docs/api-contract.md`](./api-contract.md) for error codes.

## Troubleshooting

| Issue | Likely cause |
|-------|----------------|
| **401 unauthorized** | Wrong token, missing `Bearer ` prefix, or revoked token. |
| **400 invalid_url** | Shared payload wasn’t a valid absolute URL — coerce with **Get URLs from Input**. |
| **Duplicate but wrong note** | Dedupe is by canonical URL fingerprint; notes don’t merge on duplicate capture — edit in the app. |
| **Card stays “pending” / empty** | Enrichment runs asynchronously — wait for cron/job processing or trigger enrichment manually per app docs. |

## Quick curl check (desktop)

Replace domain and token:

```bash
curl -sS -X POST "https://YOUR_DOMAIN/api/capture" \
  -H "Authorization: Bearer bmly_YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","source":"ios_shortcut"}'
```

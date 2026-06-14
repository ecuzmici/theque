# Theque — iOS capture via Shortcut (Share sheet)

iOS has no first-class way to put thèque in the Safari share sheet for free:
Web Share Target isn't supported in Safari, and a real Safari extension needs a
native app wrapper (Apple Developer account, paid). So on iPhone the
lowest-friction capture path is an **Apple Shortcut** that POSTs to
**`POST /api/capture`** with your personal Bearer token. Auth matches
[`docs/api-contract.md`](./api-contract.md); production captures use
`https://theque.app/api/capture`.

This is a **B+ experience, not the Chrome extension**: there's a brief "running"
banner on each save, and a big iOS update can occasionally require re-importing.
The recipe below gets you to **~2 taps** (Share → thèque) with a **visible
success/failure notification on every save**, so a save can never fail silently —
which is the one failure mode worth engineering against if you capture often.

## Prerequisites

- **Shortcuts app** on iPhone or iPad.
- A capture token from thèque (**Settings → Capture tokens**). You see the full
  secret **once** — paste it into the Shortcut's **Text** action (below) and
  never commit it anywhere.

## Build it once

Create a Shortcut named **Save to thèque**. In its settings (the ⓘ / settings
panel), turn on **Show in Share Sheet** and set **Accepted Types** to **URLs**
(add **Safari web pages** too so it appears on web pages directly).

Add these actions in order:

1. **Receive** *URLs and Safari web pages* from the Share Sheet.
   - Under "If there's no input", choose **Stop and Respond** (or **Ask for**
     *URL*) so a stray invocation doesn't post garbage.
2. **Text** — paste your token **including** the `bmly_` prefix, e.g.
   `bmly_xxxxxxxxxxxx`. Rename the variable to **Token** (long-press → Rename).
   Keeping the token in its own action avoids the "Allow Paste" clipboard prompt
   entirely.
3. **Get Contents of URL**
   - **URL:** `https://theque.app/api/capture`
   - **Method:** `POST`
   - **Headers:**
     - `Content-Type` = `application/json`
     - `Authorization` = `Bearer ` followed by the **Token** variable
       (type `Bearer ` with a trailing space, then insert the variable).
   - **Request Body:** **JSON** — build the object described in
     [JSON body](#json-body) below, mapping **Shortcut Input** into `url`.
4. **Get Dictionary Value** — key `created` from the **Contents of URL**.
   (Use this to branch the notification: `created` is `true` for a new save,
   `false` for a duplicate.)
5. **If** *Contents of URL* **has any value** *and the request succeeded*:
   - **Show Notification** — "✓ Saved to thèque" (or, using the `created` value,
     "Already saved" when it's `false`).
   - **Otherwise / On error:** **Show Notification** — "✗ Couldn't save — opening
     thèque" then **Open URL** `https://theque.app/add?url=` + the shared URL.
     The web `/add` page **auto-saves shared links on arrival**, so the fallback
     recovers the capture instead of losing it.

> Shortcuts' error handling is coarse. The notification step is what turns a
> silent network failure into something you actually see — don't skip it.

### Make it 2 taps

- **Pin to the share sheet:** the first time you use it, scroll the share sheet,
  tap **Edit Actions**, and move **Save to thèque** to **Favorites** (top row).
  After that it's Share → thèque, no scrolling.
- In the Shortcut settings, leave **Show in Share Sheet** on and **Ask Each
  Time** off for every field so it runs without prompts.

### Distribute / back it up

Once it works, **Share → Copy iCloud Link** from the Shortcut. Re-importing from
that link (then re-pasting the token) is far faster than rebuilding if you reset
your phone or it breaks after an iOS update.

## JSON body

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
  "tag_names": ["fiction", "queue"],
  "collection_ids": ["00000000-0000-0000-0000-000000000000"],
  "source": "ios_shortcut"
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `url` | yes | Must be `http` or `https`. Map **Shortcut Input** here. |
| `source` | yes | Use **`ios_shortcut`** for this flow. |
| `note` | no | Max 2000 chars. |
| `category_hint` | no | Enrichment hint only; deterministic classification can still override it. |
| `tag_names` | no | Lowercase normalization on server. |
| `collection_ids` | no | UUIDs must belong to your account or you get **403**. |

For fast capture, keep the body to just `url` + `source` — enrichment fills in
the card, and you triage category/tags/collections later from the Inbox in the
app. Don't build a metadata form into the Shortcut.

## Responses

- **201** — new item (`created: true`).
- **200** — duplicate fingerprint (`created: false`).
- See [`docs/api-contract.md`](./api-contract.md) for error codes.

## Troubleshooting

| Issue | Likely cause |
|-------|----------------|
| **No notification at all** | Shortcut didn't run (not pinned/selected) or Notifications are off for Shortcuts in iOS Settings. |
| **401 unauthorized** | Wrong token, missing `Bearer ` prefix, or revoked token. |
| **400 invalid_url** | Shared payload wasn't a valid absolute URL — confirm the **Receive** step accepts URLs / Safari web pages. |
| **403 forbidden** | A `collection_id` isn't yours — remove collections from body or fix IDs. |
| **Duplicate but wrong note** | Dedupe is by canonical URL fingerprint; notes don't merge on duplicate capture — edit in the app. |
| **Card stays "pending" / empty** | Enrichment runs asynchronously — wait for cron/job processing or trigger enrichment manually per app docs. |

## Quick curl check (desktop)

Replace domain and token:

```bash
curl -sS -X POST "https://theque.app/api/capture" \
  -H "Authorization: Bearer bmly_YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","source":"ios_shortcut"}'
```

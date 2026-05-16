# thèque — Chrome extension (MV3)

Capture the active tab into your library using a personal capture token (`bmly_…`) stored locally in the extension.

## Prerequisites

1. Node.js and this repo cloned on your machine.
2. Run **`npm install`** once.
3. Run **`npm run build`** so TypeScript compiles `extension/popup.ts` and `extension/background.ts` into `popup.js` / `background.js` (these outputs are gitignored).

## Load unpacked (Chrome)

1. Open Chrome → **Extensions** (`chrome://extensions`).
2. Enable **Developer mode** (toggle in the toolbar).
3. Click **Load unpacked**.
4. Select the **`extension`** folder inside this repo  
   (`extension/` in this repo), **not** the repo root.

After code changes to `popup.ts` / `background.ts`, run `npm run build` again and click **Reload** on the extension card.

## First-time setup

1. Click the thèque toolbar icon to open the popup.
2. Expand **Settings**.
3. Click **Connect to thèque** and finish the flow in the opened thèque tab.

The extension connects to `https://theque.app`. The token is stored in **`chrome.storage.local`** only on your machine.

## Capture

1. Open any normal web tab (`http` / `https`).
2. Open the popup, optionally add a **note**.
3. Click **Save current tab**.

The extension sends:

```http
POST https://theque.app/api/capture
Authorization: Bearer bmly_...
Content-Type: application/json
```

```json
{
  "url": "<current tab URL>",
  "note": "optional",
  "source": "chrome_extension"
}
```

Restricted URLs (`chrome://`, extension pages, etc.) cannot be read by extensions and will show an error.

## Troubleshooting

| Symptom | What to check |
|--------|----------------|
| **401 unauthorized** | Token missing, typo, or revoked — create a new token in Settings. |
| **Network / fetch failed** | Wrong API base URL, app not running (local), or firewall. |
| **CORS-like errors in popup console** | Extensions normally bypass CORS for allowed hosts; confirm **host_permissions** in `manifest.json` cover your API origin. |

For API semantics (duplicate detection, enrichment), see [`docs/api-contract.md`](./api-contract.md).

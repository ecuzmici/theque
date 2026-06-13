/**
 * Capture snapshot — rendered-DOM evidence sent by the Chrome extension at
 * save time. The extension sits inside a fully rendered, logged-in,
 * bot-check-passed page, so this is strictly better evidence than a server
 * fetch of the same URL. Stored in items.raw_metadata.capture_snapshot.
 *
 * Input is untrusted (arbitrary page content): every field is shape-checked,
 * size-capped, and JSON-LD blocks must parse before being kept.
 */

export const MAX_SNAPSHOT_JSON_CHARS = 64 * 1024;
const MAX_META_ENTRIES = 150;
const MAX_META_KEY_CHARS = 200;
const MAX_META_CONTENT_CHARS = 2000;
const MAX_JSON_LD_BLOCKS = 10;
const MAX_JSON_LD_CHARS = 30000;
export const MAX_SNAPSHOT_TEXT_CHARS = 8192;
const MAX_TITLE_CHARS = 1000;
const MAX_URL_CHARS = 2048;

export type CaptureSnapshotMeta = {
  attr: "property" | "name";
  key: string;
  content: string;
};

export type CaptureSnapshot = {
  captured_at: string;
  page_title?: string;
  canonical_url?: string;
  meta: CaptureSnapshotMeta[];
  json_ld: string[];
  text?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/**
 * Validate and sanitize an untrusted snapshot payload. Returns null when the
 * payload is malformed, empty, or oversized — callers treat that as "no
 * snapshot" and capture proceeds normally.
 */
export function parseCaptureSnapshot(value: unknown): CaptureSnapshot | null {
  if (!isRecord(value)) return null;

  const meta: CaptureSnapshotMeta[] = [];
  if (Array.isArray(value.meta)) {
    for (const entry of value.meta) {
      if (meta.length >= MAX_META_ENTRIES) break;
      if (!isRecord(entry)) continue;
      const { attr, key, content } = entry;
      if (attr !== "property" && attr !== "name") continue;
      if (typeof key !== "string" || !key.trim() || key.length > MAX_META_KEY_CHARS) continue;
      if (typeof content !== "string" || !content) continue;
      meta.push({ attr, key, content: content.slice(0, MAX_META_CONTENT_CHARS) });
    }
  }

  const json_ld: string[] = [];
  if (Array.isArray(value.json_ld)) {
    for (const block of value.json_ld) {
      if (json_ld.length >= MAX_JSON_LD_BLOCKS) break;
      if (typeof block !== "string" || !block.trim() || block.length > MAX_JSON_LD_CHARS) continue;
      try {
        JSON.parse(block);
      } catch {
        continue;
      }
      json_ld.push(block);
    }
  }

  const snapshot: CaptureSnapshot = {
    captured_at: isValidIsoDate(value.captured_at) ? value.captured_at : new Date().toISOString(),
    page_title:
      typeof value.page_title === "string" && value.page_title.trim()
        ? value.page_title.slice(0, MAX_TITLE_CHARS)
        : undefined,
    canonical_url:
      typeof value.canonical_url === "string" &&
      /^https?:\/\//i.test(value.canonical_url) &&
      value.canonical_url.length <= MAX_URL_CHARS
        ? value.canonical_url
        : undefined,
    meta,
    json_ld,
    text:
      typeof value.text === "string" && value.text.trim()
        ? value.text.slice(0, MAX_SNAPSHOT_TEXT_CHARS)
        : undefined,
  };

  const hasEvidence =
    snapshot.meta.length > 0 || snapshot.json_ld.length > 0 || Boolean(snapshot.text) || Boolean(snapshot.page_title);
  if (!hasEvidence) return null;
  if (JSON.stringify(snapshot).length > MAX_SNAPSHOT_JSON_CHARS) return null;

  return snapshot;
}

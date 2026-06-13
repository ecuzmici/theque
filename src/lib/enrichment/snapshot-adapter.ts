import { parseCaptureSnapshot, type CaptureSnapshot } from "@/lib/capture/capture-snapshot";

export type SnapshotFetchResult = {
  html: string;
  finalUrl: string;
  statusCode: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Re-serialize JSON-LD so a literal `</script>` inside string values cannot
 * terminate the synthetic script element. Returns null for invalid JSON. */
function safeJsonLd(block: string): string | null {
  try {
    return JSON.stringify(JSON.parse(block)).replace(/</g, "\\u003c");
  } catch {
    return null;
  }
}

/**
 * Rebuild a minimal HTML document from a capture snapshot so the existing
 * extractFromHtml pipeline (OG/Twitter/JSON-LD readers + site parsers) runs
 * unchanged on extension-provided evidence. Body text is intentionally left
 * out — it travels separately as pageText for the LLM prompt.
 */
export function snapshotToFetchResult(
  snapshot: CaptureSnapshot,
  canonicalUrl: string,
): SnapshotFetchResult {
  const parts: string[] = ["<!DOCTYPE html><html><head>"];
  if (snapshot.page_title) {
    parts.push(`<title>${escapeHtml(snapshot.page_title)}</title>`);
  }
  for (const entry of snapshot.meta) {
    parts.push(
      `<meta ${entry.attr}="${escapeHtml(entry.key)}" content="${escapeHtml(entry.content)}">`,
    );
  }
  for (const block of snapshot.json_ld) {
    const safe = safeJsonLd(block);
    if (safe) parts.push(`<script type="application/ld+json">${safe}</script>`);
  }
  parts.push("</head><body></body></html>");

  return {
    html: parts.join(""),
    finalUrl: snapshot.canonical_url ?? canonicalUrl,
    statusCode: 200,
  };
}

/** Pull a validated snapshot out of items.raw_metadata, or null. */
export function readCaptureSnapshot(rawMetadata: unknown): CaptureSnapshot | null {
  if (!rawMetadata || typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) return null;
  const candidate = (rawMetadata as Record<string, unknown>).capture_snapshot;
  if (candidate === undefined) return null;
  return parseCaptureSnapshot(candidate);
}

import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import { MAX_PAGE_TEXT_CHARS } from "@/lib/enrichment/page-text";

const DEFAULT_TIMEOUT_MS = 8000;
const READER_BASE = "https://r.jina.ai/";

export type JinaReaderResult = { markdown: string; title: string | null } | null;

function parseTitle(markdown: string): string | null {
  const m = markdown.match(/^Title:\s*(.+)$/m);
  return m ? m[1].trim() || null : null;
}

/**
 * Last-resort readability fallback for bot-walled / JS-only pages with no
 * capture snapshot. Sends the saved URL to a third party (Jina), so it is
 * gated behind JINA_READER_ENABLED (default off) and fails open.
 */
export async function fetchViaJinaReader(targetUrl: string): Promise<JinaReaderResult> {
  if (process.env.JINA_READER_ENABLED !== "true") return null;

  // r.jina.ai takes the absolute target URL appended to its base.
  const url = new URL(`${READER_BASE}${targetUrl}`);
  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  const timeoutEnv = Number.parseInt(process.env.JINA_READER_TIMEOUT_MS ?? "", 10);
  const timeoutMs = Number.isFinite(timeoutEnv) && timeoutEnv > 0 ? timeoutEnv : DEFAULT_TIMEOUT_MS;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "text/markdown" },
    });
    if (!res.ok) return null;
    const body = (await res.text()).trim();
    if (!body) return null;
    return { markdown: body.slice(0, MAX_PAGE_TEXT_CHARS), title: parseTitle(body) };
  } catch {
    return null;
  }
}

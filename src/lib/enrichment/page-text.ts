import { JSDOM, VirtualConsole } from "jsdom";

/** Cap chosen so page text adds ~1k tokens to the enrichment prompt. */
export const MAX_PAGE_TEXT_CHARS = 4000;

const NOISE_SELECTOR = "script, style, noscript, iframe, svg, nav, header, footer, aside";

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", () => {
  /* JSDOM may log CSS parse errors on large pages; extraction still proceeds */
});

/**
 * Extract readable main-content text from an HTML document for LLM prompts.
 * Returns null when there is no usable text.
 */
export function extractPageText(html: string): string | null {
  if (!html.trim()) return null;
  const dom = new JSDOM(html, { virtualConsole });
  const doc = dom.window.document;
  doc.querySelectorAll(NOISE_SELECTOR).forEach((el) => el.remove());
  const root = doc.querySelector("main") ?? doc.querySelector("article") ?? doc.body;
  const text = root?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return null;
  return text.slice(0, MAX_PAGE_TEXT_CHARS);
}

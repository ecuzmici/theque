export type SnapshotMetaEntry = { attr: "property" | "name"; key: string; content: string };

export type PageSnapshot = {
  captured_at: string;
  page_title?: string;
  canonical_url?: string;
  meta: SnapshotMetaEntry[];
  json_ld: string[];
  text?: string;
};

/**
 * Collect rendered-DOM evidence from the current page. Injected via
 * chrome.scripting.executeScript({ func }), so it MUST be self-contained:
 * no imports, no references to anything outside the function body.
 */
export function collectPageSnapshot(): PageSnapshot {
  const MAX_META = 150;
  const MAX_META_CONTENT = 2000;
  const MAX_JSON_LD_BLOCKS = 10;
  const MAX_JSON_LD_CHARS = 30000;
  const MAX_TEXT_CHARS = 8192;

  const meta: Array<{ attr: "property" | "name"; key: string; content: string }> = [];
  document.querySelectorAll("meta[property], meta[name]").forEach((el) => {
    if (meta.length >= MAX_META) return;
    const content = el.getAttribute("content");
    if (!content) return;
    const property = el.getAttribute("property");
    const name = el.getAttribute("name");
    if (property) {
      meta.push({ attr: "property", key: property, content: content.slice(0, MAX_META_CONTENT) });
    } else if (name) {
      meta.push({ attr: "name", key: name, content: content.slice(0, MAX_META_CONTENT) });
    }
  });

  const json_ld: string[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    if (json_ld.length >= MAX_JSON_LD_BLOCKS) return;
    const text = el.textContent?.trim();
    if (text && text.length <= MAX_JSON_LD_CHARS) json_ld.push(text);
  });

  // Prefer semantic main content; strip obvious chrome by cloning and
  // removing nav/header/footer/aside before reading text.
  const mainEl = document.querySelector("main") ?? document.querySelector("article");
  let textRoot: HTMLElement | null = mainEl as HTMLElement | null;
  if (!textRoot && document.body) {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll("nav, header, footer, aside, script, style, noscript, iframe, svg")
      .forEach((el) => el.remove());
    textRoot = clone;
  }
  // innerText reflects rendering; cloned/detached nodes and test DOMs fall
  // back to textContent.
  const rawText = textRoot ? (textRoot.innerText ?? textRoot.textContent ?? "") : "";
  const text = rawText.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS) || undefined;

  const canonical =
    document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? undefined;

  return {
    captured_at: new Date().toISOString(),
    page_title: document.title || undefined,
    canonical_url: canonical && /^https?:\/\//i.test(canonical) ? canonical : undefined,
    meta,
    json_ld,
    text,
  };
}

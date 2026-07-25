/**
 * Pocket HTML export parser (`ril_export.html`).
 *
 * Pocket shut down permanently in 2025, so every one of these files is frozen
 * on disk forever — the format will never change again, which makes it worth
 * reading correctly once.
 *
 * ## It is not a Netscape bookmark file
 *
 * It looks like bookmark HTML and it is not: no `NETSCAPE-Bookmark-file-1`
 * doctype, no `<DL>`, no `<DT>`. It is a flat `<ul>` / `<li>` list under `<h1>`
 * section headings:
 *
 * ```html
 * <title>Pocket Export</title>
 * <h1>Unread</h1>
 * <ul><li><a href="…" time_added="1600000000" tags="a,b">Title</a></li></ul>
 * <h1>Read Archive</h1>
 * <ul>…</ul>
 * ```
 *
 * The heading determines status — `Unread` → `want`, `Read Archive` → `done`.
 * Either `<ul>` may be present but empty, so neither section can be assumed to
 * contain items. Attributes are lower-case; `time_added` is Unix **seconds**;
 * `tags` is **comma**-delimited here (the CSV export uses pipes instead) and is
 * `""` when there are none. Anchor text can be empty, in which case Pocket's own
 * UI fell back to showing the URL, so we do the same.
 *
 * `time_added` is when the item was *saved*, not when it was read, so it becomes
 * `created_at_hint`. Archived items get no `done_at` — the file does not record
 * one, and inventing it would put fabricated dates into the taste loop.
 */

import { JSDOM, VirtualConsole } from "jsdom";

import {
  IMPORT_MAX_ROWS,
  IMPORT_MAX_SKIPS,
  IMPORT_SKIP_REASONS,
  type ImportInput,
  type ImportParseResult,
  type ImportRow,
  type ImportSkip,
  type Importer,
} from "@/lib/import/types";
import type { ItemStatus } from "@/lib/database.types";
import {
  classifyUrl,
  cleanValue,
  collapseWhitespace,
  isTooLongUrl,
  splitLabels,
  truncateRawSnippet,
  truncateTitle,
  unixTimestampToIso,
} from "@/lib/import/value";

export const POCKET_HTML_IMPORTER_ID = "pocket-html";

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", () => {
  /* Exported markup is unmaintained; recovery is fine. */
});

/**
 * Map a section heading to a status.
 *
 * "Unread" contains the substring "read", so `Read Archive` has to be tested
 * on a word boundary and checked first.
 */
export function statusForPocketHeading(heading: string | null | undefined): ItemStatus | null {
  const text = collapseWhitespace(heading);
  if (text === null) return null;
  if (/\barchive\b/i.test(text)) return "done";
  if (/\bunread\b/i.test(text)) return "want";
  return null;
}

export function parsePocketHtml(
  input: ImportInput,
  options: { maxRows?: number } = {},
): ImportParseResult {
  const rows: ImportRow[] = [];
  const skipped: ImportSkip[] = [];
  const warnings: string[] = [];
  let skippedOverflow = 0;

  const addSkip = (skip: ImportSkip): void => {
    if (skipped.length >= IMPORT_MAX_SKIPS) {
      skippedOverflow += 1;
      return;
    }
    skipped.push(skip);
  };

  const dom = new JSDOM(input.text, { virtualConsole });
  // Document order, so a heading always precedes the anchors it governs.
  const nodes = Array.from(dom.window.document.querySelectorAll("h1, h2, h3, a[href]"));
  const maxRows = options.maxRows ?? IMPORT_MAX_ROWS;

  // Anchors appearing before any heading are unread by default: an export whose
  // first section is empty still lists nothing before the first <h1>.
  let status: ItemStatus = "want";

  for (const node of nodes) {
    if (node.tagName !== "A") {
      const mapped = statusForPocketHeading(node.textContent);
      if (mapped) status = mapped;
      continue;
    }

    if (rows.length >= maxRows) {
      warnings.push(`Only the first ${maxRows} items were read; the file contains more.`);
      break;
    }

    const href = cleanValue(node.getAttribute("href"));
    if (!href) {
      addSkip({
        reason: IMPORT_SKIP_REASONS.missingUrl,
        raw: truncateRawSnippet(node.outerHTML),
      });
      continue;
    }
    if (isTooLongUrl(href)) {
      addSkip({ reason: IMPORT_SKIP_REASONS.urlTooLong, raw: truncateRawSnippet(href) });
      continue;
    }
    const urlKind = classifyUrl(href);
    if (urlKind !== "ok") {
      addSkip({
        reason:
          urlKind === "invalid"
            ? IMPORT_SKIP_REASONS.invalidUrl
            : IMPORT_SKIP_REASONS.unsupportedScheme,
        raw: truncateRawSnippet(href),
      });
      continue;
    }

    rows.push({
      url: href,
      title: truncateTitle(node.textContent) ?? truncateTitle(href),
      description: null,
      image_url: null,
      category: "articles",
      status,
      created_at_hint: unixTimestampToIso(node.getAttribute("time_added")),
      labels: splitLabels(node.getAttribute("tags"), ","),
      source_ref: {
        importer: POCKET_HTML_IMPORTER_ID,
        file: input.filename ?? null,
      },
    });
  }

  if (skippedOverflow > 0) {
    warnings.push(`${skippedOverflow} further skipped items were not listed individually.`);
  }
  if (rows.length === 0 && skipped.length === 0) {
    warnings.push("No saved items were found in this file.");
  }

  return { rows, skipped, warnings };
}

export function detectPocketHtml(input: ImportInput): boolean {
  const text = input.text;
  if (/<!DOCTYPE\s+NETSCAPE-Bookmark-file-1/i.test(text.slice(0, 4096))) return false;
  return (
    /<title>\s*Pocket Export\s*<\/title>/i.test(text) ||
    // Pocket's exporter signs off with this comment in every file.
    /So long and thanks for all the fish/i.test(text) ||
    (/\btime_added\s*=/i.test(text) && !/<dl[\s>]/i.test(text))
  );
}

export const pocketHtmlImporter: Importer = {
  id: POCKET_HTML_IMPORTER_ID,
  label: "Pocket (HTML export)",
  accepts: [".html", ".htm"],
  detect: detectPocketHtml,
  parse: async (input) => parsePocketHtml(input),
};

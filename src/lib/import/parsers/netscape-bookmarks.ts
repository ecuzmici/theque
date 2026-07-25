/**
 * Netscape bookmark-file parser (`<!DOCTYPE NETSCAPE-Bookmark-file-1>`).
 *
 * One parser, ~12 sources: Chrome, Edge, Brave, Firefox, Safari, Raindrop,
 * linkding, Karakeep, Delicious-era tools and anything that ever shipped a
 * "export bookmarks" button.
 *
 * ## Why this is defensive rather than tidy
 *
 * The format has no DTD and is malformed by design. `<DL><p>` opens a `<p>`
 * that is never closed; `<DT>` and `<DD>` are never closed; a folder ends with
 * `</DL><p>`, which opens yet another orphan paragraph. A strict XML parse
 * cannot read a single real file. jsdom's HTML5 parser applies the same
 * error-recovery a browser does, which is exactly what these files were written
 * against — so structure is recovered from the resulting DOM rather than from
 * the tag soup.
 *
 * Safari is the shape that breaks naive parsers: it writes **no** `ADD_DATE`,
 * `LAST_MODIFIED`, `ICON`, `TAGS` or `<DD>`; it emits a valueless
 * `<H3 FOLDED>`; and it has **no root `<DL>` wrapper** — top-level folders sit
 * directly under `<H1>`. Anything that does "find the first `<DL>` and iterate"
 * quietly returns different results for Safari. This parser instead walks every
 * anchor in document order and reconstructs each folder path from ancestors, so
 * the presence or absence of a root wrapper is irrelevant.
 */

import { JSDOM, VirtualConsole } from "jsdom";

import {
  DEFAULT_IMPORT_STATUS,
  IMPORT_MAX_ROWS,
  IMPORT_MAX_SKIPS,
  IMPORT_SKIP_REASONS,
  type ImportInput,
  type ImportParseResult,
  type ImportRow,
  type ImportSkip,
  type Importer,
} from "@/lib/import/types";
import {
  classifyUrl,
  cleanValue,
  collapseWhitespace,
  dedupeLabels,
  isTooLongUrl,
  parseBookmarkTimestamp,
  splitLabels,
  truncateNote,
  truncateRawSnippet,
  truncateTitle,
} from "@/lib/import/value";

export const NETSCAPE_IMPORTER_ID = "netscape-bookmarks";

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", () => {
  /* These files are malformed on purpose; recovery is the expected path. */
});

/**
 * Read an attribute regardless of source casing.
 *
 * Real files mix `ADD_DATE`, `add_date` and `Add_Date`. The HTML parser
 * lowercases attribute names, so `getAttribute` is already case-insensitive
 * here — the extra probes just make that independent of the DOM implementation.
 */
function attr(el: Element, name: string): string | null {
  return el.getAttribute(name) ?? el.getAttribute(name.toUpperCase()) ?? null;
}

function firstChildHeading(el: Element): Element | null {
  for (const child of Array.from(el.children)) {
    if (child.tagName === "H3") return child;
  }
  return null;
}

/**
 * Find the folder heading that owns a `<DL>`.
 *
 * Two shapes occur, depending on how the file's unclosed `<DT>` tags recover:
 * the `<DL>` nests *inside* the `<DT>` that holds the `<H3>` (Chromium,
 * Firefox), or it follows that `<DT>` as a sibling (Safari, which has no root
 * wrapper). Both are checked.
 */
function headingForList(dl: Element): Element | null {
  const parent = dl.parentElement;
  if (parent && (parent.tagName === "DT" || parent.tagName === "DD")) {
    const heading = firstChildHeading(parent);
    if (heading) return heading;
  }

  let prev = dl.previousElementSibling;
  while (prev) {
    if (prev.tagName === "H3") return prev;
    if (prev.tagName === "DT") return firstChildHeading(prev) ?? prev.querySelector("h3");
    // Another list or a bare anchor means we've walked past this folder's head.
    if (prev.tagName === "DL" || prev.tagName === "A") return null;
    prev = prev.previousElementSibling;
  }
  return null;
}

/** Folder path for an anchor, outermost first. */
function folderPath(anchor: Element): string[] {
  const path: string[] = [];
  let node: Element | null = anchor.parentElement;
  while (node) {
    if (node.tagName === "DL") {
      const heading = headingForList(node);
      const name = heading ? collapseWhitespace(heading.textContent) : null;
      if (name) path.unshift(name);
    }
    node = node.parentElement;
  }
  return path;
}

/**
 * The `<DD>` description that follows an anchor's `<DT>`.
 *
 * A `<DD>` start tag closes the open `<DT>`, so after parsing the description
 * is the `<DT>`'s next sibling rather than a descendant.
 */
function descriptionFor(anchor: Element): string | null {
  let node: Element | null = anchor;
  while (node && node.tagName !== "DT") node = node.parentElement;
  const start = node ?? anchor;
  const next = start.nextElementSibling;
  if (next && next.tagName === "DD") return collapseWhitespace(next.textContent);
  return null;
}

function labelsFor(anchor: Element): string[] {
  // TAGS is non-standard but common (Firefox, linkding, Karakeep, Raindrop) and
  // comma-delimited in a single attribute. Chromium and Safari never write it.
  const tags = splitLabels(attr(anchor, "tags"), ",");
  return dedupeLabels([...folderPath(anchor), ...tags]);
}

export function parseNetscapeBookmarks(
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
  const anchors = Array.from(dom.window.document.querySelectorAll("a[href]"));
  const maxRows = options.maxRows ?? IMPORT_MAX_ROWS;

  for (const anchor of anchors) {
    if (rows.length >= maxRows) {
      warnings.push(
        `Only the first ${maxRows} bookmarks were read; the file contains more.`,
      );
      break;
    }

    const href = cleanValue(attr(anchor, "href"));
    const title = truncateTitle(anchor.textContent);
    const snippet = truncateRawSnippet(href ?? anchor.outerHTML);

    if (!href) {
      addSkip({ reason: IMPORT_SKIP_REASONS.missingUrl, raw: truncateRawSnippet(anchor.outerHTML) });
      continue;
    }
    if (isTooLongUrl(href)) {
      addSkip({ reason: IMPORT_SKIP_REASONS.urlTooLong, raw: snippet });
      continue;
    }
    // Real bookmark files carry javascript: bookmarklets, data: URIs and
    // chrome:// / file:// / place: entries. None of them are capturable.
    const urlKind = classifyUrl(href);
    if (urlKind !== "ok") {
      addSkip({
        reason:
          urlKind === "invalid"
            ? IMPORT_SKIP_REASONS.invalidUrl
            : IMPORT_SKIP_REASONS.unsupportedScheme,
        raw: snippet,
      });
      continue;
    }

    const rawAddDate = attr(anchor, "add_date");
    const added = parseBookmarkTimestamp(rawAddDate);
    if (added.kind === "out_of_range") {
      addSkip({
        reason: "timestamp_out_of_range",
        raw: `${snippet} (ADD_DATE=${added.raw})`,
      });
      continue;
    }

    rows.push({
      url: href,
      title,
      // ICON / ICON_URI are base64 favicons, not cover art. Reading them would
      // also mean carrying ~95% of a 10-20 MB Chrome export into memory.
      image_url: null,
      description: truncateNote(descriptionFor(anchor)),
      category: null,
      status: DEFAULT_IMPORT_STATUS,
      created_at_hint: added.kind === "ok" ? added.iso : null,
      labels: labelsFor(anchor),
      source_ref: {
        importer: NETSCAPE_IMPORTER_ID,
        file: input.filename ?? null,
      },
    });
  }

  if (skippedOverflow > 0) {
    warnings.push(`${skippedOverflow} further skipped bookmarks were not listed individually.`);
  }
  if (rows.length === 0 && skipped.length === 0) {
    warnings.push("No bookmarks were found in this file.");
  }

  return { rows, skipped, warnings };
}

export function detectNetscapeBookmarks(input: ImportInput): boolean {
  const head = input.text.slice(0, 4096);
  if (/<!DOCTYPE\s+NETSCAPE-Bookmark-file-1/i.test(head)) return true;
  // Some tools drop the doctype; the DL/DT skeleton is still unmistakable, and
  // Pocket's flat <ul>/<li> export has neither tag.
  return /<dl[\s>]/i.test(input.text) && /<dt[\s>]/i.test(input.text);
}

export const netscapeBookmarksImporter: Importer = {
  id: NETSCAPE_IMPORTER_ID,
  label: "Browser bookmarks (Chrome, Firefox, Safari, Edge, Raindrop, …)",
  accepts: [".html", ".htm"],
  detect: detectNetscapeBookmarks,
  parse: async (input) => parseNetscapeBookmarks(input),
};

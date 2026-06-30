// Pure helpers for the /add file importer: turn a bookmarks-HTML or CSV export
// into a deduped list of http(s) URLs that the existing batch-save flow can
// consume. No DOM, no network — safe to unit-test in isolation.

/** Hard cap on how many imported URLs we hand to the batch-save loop, so a
 *  10k-bookmark export can't hammer the capture API in one go. */
export const MAX_IMPORT_URLS = 200;

export type ImportFormat = "html" | "csv" | "text";

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function dedupe(urls: string[]): string[] {
  return Array.from(new Set(urls));
}

// Minimal HTML-entity decode for the handful that show up inside href values
// (Netscape/Pocket exports encode `&` as `&amp;`).
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'");
}

/** Extract every http(s) href from a Netscape bookmarks file (browser export
 *  or Pocket's `ril_export.html`). Ignores `place:`, `javascript:`, etc. */
export function parseBookmarksHtml(html: string): string[] {
  const out: string[] = [];
  const re = /<a\s[^>]*?href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = decodeEntities(match[1].trim());
    if (isHttpUrl(href)) out.push(href);
  }
  return out;
}

// RFC-4180-ish CSV reader: handles quoted fields, escaped `""`, and CRLF.
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Goodreads wraps some columns in a `="..."` spreadsheet-formula guard; strip
// a leading `=` (and any stray surrounding quotes the reader left behind).
function cleanCell(value: string | undefined): string {
  if (!value) return "";
  let v = value.trim();
  if (v.startsWith("=")) v = v.slice(1).trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v.trim();
}

function normalizeHeader(value: string): string {
  return cleanCell(value).toLowerCase();
}

/** Extract URLs from a CSV export. Prefers a `url`/`href` column; falls back to
 *  building Goodreads URLs from a `Book Id` column when no URL column exists. */
export function parseCsvUrls(csv: string): string[] {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) return [];
  const header = rows[0].map(normalizeHeader);
  const urlIdx = header.findIndex((h) => h === "url" || h === "href");
  const bookIdIdx = header.findIndex((h) => h === "book id" || h === "bookid");
  if (urlIdx === -1 && bookIdIdx === -1) return [];

  const out: string[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (urlIdx !== -1) {
      const value = cleanCell(cells[urlIdx]);
      if (isHttpUrl(value)) out.push(value);
    } else {
      const id = cleanCell(cells[bookIdIdx]).replace(/[^0-9]/g, "");
      if (id) out.push(`https://www.goodreads.com/book/show/${id}`);
    }
  }
  return out;
}

export function detectImportFormat(filename: string, content: string): ImportFormat {
  if (/\.html?$/i.test(filename)) return "html";
  if (/\.csv$/i.test(filename)) return "csv";
  // Fall back to sniffing content when the extension is missing/unknown.
  if (/<!DOCTYPE\s+NETSCAPE/i.test(content) || /<a\s[^>]*href/i.test(content)) {
    return "html";
  }
  const firstLine = content.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  if (firstLine.includes(",") && /\b(url|href|book id)\b/i.test(firstLine)) {
    return "csv";
  }
  return "text";
}

/** Dispatch by detected format and return a deduped list of http(s) URLs.
 *  `text` is the catch-all: treat the file as whitespace-separated URLs. */
export function extractImportedUrls(filename: string, content: string): string[] {
  const format = detectImportFormat(filename, content);
  let urls: string[];
  if (format === "html") {
    urls = parseBookmarksHtml(content);
  } else if (format === "csv") {
    urls = parseCsvUrls(content);
  } else {
    urls = content
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(isHttpUrl);
  }
  return dedupe(urls);
}

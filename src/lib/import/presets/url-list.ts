/**
 * Plain URL list — the worked example of a CSV preset.
 *
 * This is what every preset looks like: a header signature for detection and a
 * column→field mapping. No parsing code, no engine changes. Adding Goodreads
 * later is a file this size.
 *
 * Handles both a headered CSV (`url,title,note`) and a bare newline-separated
 * list of URLs, via the engine's `"auto"` header mode — a header row never
 * contains a URL, so a URL in record 0 means the file is headerless.
 *
 * Registered last, so it only ever catches files no real preset claimed.
 */

import type { CsvPreset } from "@/lib/import/csv-engine";
import { DEFAULT_URL_COLUMNS } from "@/lib/import/csv-engine";

export const urlListPreset: CsvPreset = {
  id: "url-list",
  label: "Plain URL list",
  accepts: [".csv", ".txt", ".tsv"],
  signature: [],
  detect: (headers) =>
    headers.length <= 4 && headers.some((header) => DEFAULT_URL_COLUMNS.includes(header)),
  header: { mode: "auto", synthetic: ["url", "title", "note"] },
  defaults: { status: "want" },
  mapping: {
    url: DEFAULT_URL_COLUMNS,
    title: ["title", "name"],
    verdict: ["note", "notes", "comment", "comments"],
  },
};

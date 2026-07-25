/**
 * Instapaper CSV export → `articles`.
 *
 * Two variants are in the wild and both are current, depending on when the
 * account was created:
 *
 * ```
 * URL,Title,Selection,Folder,Timestamp,Tags
 * URL,Title,Selection,Folder
 * ```
 *
 * `URL` is fully upper-case, which `normalizeHeader` folds away.
 *
 * ## Traps
 *
 * - `Selection` is the **highlighted excerpt** from the article, not something
 *   the user wrote about it. It is a description, and mapping it to `verdict`
 *   would feed the article's own prose into the taste profile as if it were the
 *   reader's opinion.
 * - `Timestamp` is Unix **seconds**.
 * - `Tags` is a **JSON array literal** (`[]`, `["design","tools"]`), not a
 *   delimited string. It is split on the bracket/quote/comma run rather than
 *   `JSON.parse`d: a truncated or hand-edited cell then degrades to the tags it
 *   can still see instead of throwing away the row.
 * - `Folder` is `Unread` / `Archive` / `Starred` or a user-created name. Only
 *   `Archive` means read.
 */

import type { CsvPreset } from "@/lib/import/csv-engine";

/** Folder names that are reading state, not a topic worth keeping as a label. */
const STATE_FOLDERS = new Set(["unread", "archive"]);

export const instapaperPreset: CsvPreset = {
  id: "instapaper",
  label: "Instapaper (CSV export)",
  // `Selection` is the column no other bookmark export has.
  signature: ["url", "title", "selection", "folder"],
  defaults: { category: "articles", status: "want" },
  mapping: {
    url: "URL",
    title: "Title",
    // The article's own words, not the reader's.
    description: "Selection",
    status: {
      columns: ["Folder"],
      derive: (value) => (value?.toLowerCase() === "archive" ? "done" : "want"),
    },
    // Absent in the four-column variant, which simply yields null.
    created_at_hint: "Timestamp",
    labels: {
      columns: ["Tags", "Folder"],
      // Peels a JSON array apart without parsing it: `["a","b"]` splits into
      // the two names, `[]` into nothing, and a malformed cell into whatever
      // survives.
      separator: /[[\]",]+/,
      exclude: (label) => STATE_FOLDERS.has(label.toLowerCase()),
    },
  },
};

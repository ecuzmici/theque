/**
 * The StoryGraph export → `books`.
 *
 * 23 columns, stable from 2021 through 2026:
 * `Title,Authors,Contributors,ISBN/UID,Format,Read Status,Date Added,
 * Last Date Read,Dates Read,Read Count,Moods,Pace,Character- or Plot-Driven?,
 * Strong Character Development?,Loveable Characters?,Diverse Characters?,
 * Flawed Characters?,Star Rating,Review,Content Warnings,
 * Content Warning Description,Tags,Owned?` — note the literal `?` and hyphens,
 * which `normalizeHeader` keeps (it only folds case, `_` and `-`).
 *
 * ## Traps
 *
 * - The rating column is **`Star Rating`**, decimal 1..5 in **0.25 steps**
 *   (`4.25`, `4.75`). Unlike Goodreads, an unrated book leaves the cell
 *   **empty** rather than writing `0`.
 * - `ISBN/UID` is a UID, not an ISBN: for Kindle editions it holds an Amazon
 *   **ASIN** (`B08XYZ1234`). `https://openlibrary.org/isbn/B08XYZ1234` is a 404,
 *   so those rows are skipped with a reason that names the real cause instead of
 *   being imported as dead links.
 * - `Dates Read` is a single date, a range (`2024/01/01-2024/01/07`), **or a
 *   comma-separated list of ranges** inside one quoted cell — one entry per
 *   re-read. `Last Date Read` says the same thing without the parsing, so it is
 *   preferred and `Dates Read` is only mined when it is empty.
 * - `Format` **does** exist here (it does not in Goodreads, where the analogue
 *   is `Binding`).
 */

import type { CsvPreset } from "@/lib/import/csv-engine";
import { htmlToPlainText, toIsoDate } from "@/lib/import/value";

/**
 * Is this UID an ISBN we can build an Open Library URL from?
 *
 * ISBN-13 is 13 digits; ISBN-10 is 9 digits plus a check character that may be
 * `X`. An ASIN is 10 characters that are not all digits (in practice `B` plus
 * nine alphanumerics), so the digit test separates the two without needing an
 * ASIN pattern.
 */
export function isIsbnLike(raw: string): boolean {
  const compact = raw.replace(/[\s-]/g, "").toUpperCase();
  return /^\d{13}$/.test(compact) || /^\d{9}[\dX]$/.test(compact);
}

/** Latest `YYYY/MM/DD` in a `Dates Read` cell of ranges and lists. */
export function lastDateReadFrom(raw: string | null): string | null {
  if (!raw) return null;
  const matches = raw.match(/\d{4}\/\d{1,2}\/\d{1,2}/g);
  if (!matches || matches.length === 0) return null;
  // Zero-padded `YYYY/MM/DD` sorts lexically, but StoryGraph is inconsistent
  // about padding, so compare the parsed instants instead.
  let latest: string | null = null;
  for (const match of matches) {
    const iso = toIsoDate(match);
    if (iso && (latest === null || iso > latest)) latest = iso;
  }
  return latest;
}

export const storygraphPreset: CsvPreset = {
  id: "storygraph",
  label: "The StoryGraph (library export)",
  signature: ["title", "authors", "isbn/uid", "read status", "star rating"],
  defaults: { category: "books", status: "want" },
  skipRow: (row) => {
    const uid = row.get("ISBN/UID");
    if (!uid) return "missing_isbn";
    // An ASIN or other non-ISBN UID: skipping beats a guaranteed-dead URL.
    if (!isIsbnLike(uid)) return "identifier_not_an_isbn";
    return null;
  },
  mapping: {
    url: {
      columns: ["ISBN/UID"],
      // `skipRow` has already guaranteed this is an ISBN.
      derive: (value) => (value ? `https://openlibrary.org/isbn/${value.replace(/[\s-]/g, "")}` : null),
    },
    external_id: "ISBN/UID",
    title: "Title",
    subtitle: "Authors",
    status: {
      columns: ["Read Status"],
      derive: (value) => {
        switch (value?.toLowerCase()) {
          case "read":
            return "done";
          // Abandoned on purpose — a real decision about the book, and the
          // status the app uses for "I have decided against this".
          case "did-not-finish":
            return "dismissed";
          default:
            return "want";
        }
      },
    },
    // 1..5 in quarter steps; empty (not 0) means unrated.
    rating: { columns: ["Star Rating"], scale: "quarter_stars" },
    verdict: { columns: ["Review"], derive: (value) => htmlToPlainText(value) },
    done_at: {
      columns: ["Last Date Read"],
      derive: (value, row) => value ?? lastDateReadFrom(row.get("Dates Read")),
    },
    created_at_hint: "Date Added",
    labels: { columns: ["Tags"] },
  },
};

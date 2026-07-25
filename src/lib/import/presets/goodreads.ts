/**
 * Goodreads library export → `books`.
 *
 * Verified against both eras of `goodreads_library_export.csv`:
 *
 * - **Current (24 columns)** — `Book Id … Read Count,Owned Copies`.
 * - **Pre-mid-2022 (31 columns)** — the same names plus `Recommended For`,
 *   `Recommended By`, `Original Purchase Date`, `Original Purchase Location`,
 *   `Condition`, `Condition Description` and `BCID`, with `Owned Copies` sitting
 *   at position 26 instead of last.
 *
 * That single moved column is why this file names columns and never positions:
 * a positional reader silently reads purchase metadata as ownership across the
 * era boundary. Both eras share every column this preset touches, so one
 * signature covers them.
 *
 * ## Traps
 *
 * - `My Rating` is `0..5` where **`0` means unrated** — a large export is mostly
 *   zeros. `Average Rating` next to it is the community mean (decimal) and must
 *   never be imported as a personal rating.
 * - Dates are `YYYY/MM/DD` with slashes, and `Date Read` is frequently empty
 *   even for books on the `read` shelf (Goodreads only records it when the user
 *   entered one). An empty date is left null rather than guessed at.
 * - `ISBN` / `ISBN13` are Excel-escaped as `="9780765312181"`, and an absent
 *   ISBN is the literal `=""` — `cleanValue` unwraps both, so `=""` is null.
 * - There is **no `Format` column**; the analogue is `Binding` (`Format` is a
 *   StoryGraph column and looking for it here finds nothing).
 * - `My Review` is HTML, so it is flattened before it becomes a verdict.
 */

import type { CsvPreset } from "@/lib/import/csv-engine";
import { htmlToPlainText } from "@/lib/import/value";

/** Shelves that Goodreads treats as exclusive; they become `status`, not labels. */
const EXCLUSIVE_SHELVES = new Set(["read", "currently-reading", "to-read"]);

export const goodreadsPreset: CsvPreset = {
  id: "goodreads",
  label: "Goodreads (library export)",
  // `Book Id` + `Exclusive Shelf` are unique to Goodreads; `My Rating` guards
  // against a hand-trimmed file that kept only bibliographic columns.
  signature: ["book id", "title", "my rating", "exclusive shelf"],
  defaults: { category: "books", status: "want" },
  mapping: {
    // Goodreads exports carry no URL column; the id rebuilds the canonical one.
    url: {
      columns: ["Book Id"],
      derive: (value) => (value ? `https://www.goodreads.com/book/show/${value}` : null),
    },
    external_id: "Book Id",
    title: "Title",
    // `Author` is the display form ("Neal Stephenson"); `Author l-f` is the
    // sort form ("Stephenson, Neal") — note the lower-case l and f.
    subtitle: ["Author", "Author l-f"],
    status: {
      columns: ["Exclusive Shelf"],
      derive: (value) => (value?.toLowerCase() === "read" ? "done" : "want"),
    },
    // 0..5 whole stars, 0 = unrated. NOT `Average Rating`.
    rating: { columns: ["My Rating"], scale: "five" },
    // `Private Notes` backs up `My Review`: both are the user's own words, and a
    // reader who keeps notes private has nothing in `My Review` at all.
    verdict: {
      columns: ["My Review", "Private Notes"],
      derive: (value) => htmlToPlainText(value),
    },
    done_at: "Date Read",
    created_at_hint: "Date Added",
    labels: {
      columns: ["Bookshelves"],
      exclude: (label) => EXCLUSIVE_SHELVES.has(label.toLowerCase()),
    },
  },
};

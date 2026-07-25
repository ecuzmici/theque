/**
 * IMDb exports → `movies_and_tv`.
 *
 * IMDb ships two different CSV shapes and they must not be conflated:
 *
 * - **`ratings.csv`** — `Const,Your Rating,Date Rated,Title,Original Title,URL,
 *   Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,
 *   Directors` (14 columns). The legacy export is identical minus
 *   `Original Title` (13 columns); both parse from the same signature.
 * - **A list / watchlist export** — `Position,Const,Created,Modified,
 *   Description,Title,…`, where `Your Rating` and `Date Rated` are present only
 *   when the account has rated the entry.
 *
 * ## Traps
 *
 * - `Your Rating` is **1..10**. `IMDb Rating` beside it is the community score
 *   and is deliberately ignored — importing it would fill the taste profile with
 *   the crowd's opinion instead of the user's.
 * - **`Title` and `Genres` are localized to the account language.** A Korean
 *   account exports `Genres` as `"범죄, 미스터리"`. Only `Const` and `URL` are
 *   language-stable, so detection and identity key on those and never on a title
 *   or a genre string.
 * - Watchlist `URL`s carry a **trailing slash** (`…/title/tt1234567/`) where
 *   ratings `URL`s do not. The raw value is kept as-is here, per the parser
 *   contract; `normalizeUrl` in `src/lib/url/normalize.ts` drops the trailing
 *   slash at ingest, so the two exports dedupe against each other there.
 */

import type { CsvFieldSpec, CsvPreset, CsvRowContext } from "@/lib/import/csv-engine";

/** `Directors · Year`, matching the subtitle shape enrichment already writes. */
const directorAndYear: CsvFieldSpec<string> = {
  columns: ["Directors"],
  derive: (value: string | null, row: CsvRowContext) => {
    const parts = [value, row.get("Year")].filter((part): part is string => Boolean(part));
    return parts.length ? parts.join(" · ") : null;
  },
};

export const imdbRatingsPreset: CsvPreset = {
  id: "imdb-ratings",
  label: "IMDb (ratings export)",
  signature: ["const", "your rating", "date rated", "url"],
  // A list export also carries `Your Rating`; `Position`/`Created` tell them
  // apart, and the list preset below owns those files.
  detect: (headers) => !headers.includes("position") && !headers.includes("created"),
  // A rating only exists for something already watched.
  defaults: { category: "movies_and_tv", status: "done" },
  mapping: {
    url: "URL",
    external_id: "Const",
    // `Original Title` is the fallback for the legacy 13-column export, which
    // does not have it — `getAny` takes the first non-blank.
    title: ["Title", "Original Title"],
    subtitle: directorAndYear,
    // 1..10 → 1..5. Never `IMDb Rating`.
    rating: { columns: ["Your Rating"], scale: "ten" },
    // A *proxy* for when it was watched: IMDb records when the rating was
    // entered, not the viewing. It is the only date in the file.
    done_at: "Date Rated",
    created_at_hint: "Date Rated",
    // Localized strings; kept because they are the user's own shelf vocabulary.
    labels: { columns: ["Genres"] },
  },
};

export const imdbListPreset: CsvPreset = {
  id: "imdb-list",
  label: "IMDb (watchlist or list export)",
  signature: ["const", "created", "modified", "url"],
  defaults: { category: "movies_and_tv", status: "want" },
  mapping: {
    url: "URL",
    external_id: "Const",
    title: ["Title", "Original Title"],
    subtitle: directorAndYear,
    // Optional in this shape: absent for a plain watchlist, present when the
    // account has rated the entry.
    rating: { columns: ["Your Rating"], scale: "ten" },
    // A watchlist entry the user has since rated has been watched; without a
    // rating date it stays on the want shelf, which is what a watchlist is.
    status: {
      columns: ["Date Rated"],
      derive: (value) => (value ? "done" : "want"),
    },
    done_at: "Date Rated",
    // The list owner's own note about the entry, not a synopsis.
    verdict: "Description",
    created_at_hint: "Created",
    labels: { columns: ["Genres"] },
  },
};

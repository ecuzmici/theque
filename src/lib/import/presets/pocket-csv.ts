/**
 * Pocket CSV export — the shutdown-era format.
 *
 * Verified against Mozilla's own export generator. Columns are
 * `title,url,time_added,tags,status`. Three traps, all of which differ from the
 * HTML export parsed in `../parsers/pocket-html.ts`:
 *
 * 1. `time_added` is Unix **seconds** (handled by the engine's date coercion).
 * 2. `tags` is **pipe**-delimited here, where the HTML export uses commas.
 * 3. `status` is exactly `unread` | `archive` — `archive`, **not** `archived`.
 *
 * Delivery is a ZIP named `pocket.zip` containing `part_000000.csv`, split into
 * `part_NNNNNN.csv` for large libraries. ZIP handling is out of scope for this
 * engine: the caller must unpack the archive and feed each `part_*.csv` through
 * this preset separately, concatenating the results.
 */

import type { CsvPreset } from "@/lib/import/csv-engine";

export const pocketCsvPreset: CsvPreset = {
  id: "pocket-csv",
  label: "Pocket (CSV export)",
  signature: ["url", "time added", "status"],
  defaults: { category: "articles", status: "want" },
  mapping: {
    url: "url",
    title: "title",
    created_at_hint: "time added",
    // "archive" — not "archived". Anything else falls through to the default.
    status: {
      columns: ["status"],
      derive: (value) => (value?.toLowerCase() === "archive" ? "done" : "want"),
    },
    labels: { columns: ["tags"], separator: "|" },
  },
};

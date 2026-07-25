/**
 * CSV preset registry.
 *
 * A preset is a declarative column mapping (see `./url-list.ts` for the shape).
 * Adding a source means adding a file here, never touching `../csv-engine.ts`.
 *
 * **Order matters.** `detectCsvPreset` returns the first match, so specific
 * presets go first and broad fallbacks (`url-list`) go last.
 *
 * **Detection is by header signature, never by filename, and mapping is by
 * header name, never by column position.** Every long-lived export has era
 * variants that shift columns — Goodreads' `Owned Copies` moved between the
 * 31-column pre-2022 export and today's 24-column one — so positional parsing
 * corrupts data silently across eras. `CsvColumnMapping` only accepts column
 * names, which makes that mistake unrepresentable.
 */

import type { CsvPreset } from "@/lib/import/csv-engine";
import { pocketCsvPreset } from "@/lib/import/presets/pocket-csv";
import { urlListPreset } from "@/lib/import/presets/url-list";

export const CSV_PRESETS: readonly CsvPreset[] = [
  pocketCsvPreset,
  // Fallback: must stay last.
  urlListPreset,
];

export function getCsvPreset(id: string): CsvPreset | null {
  return CSV_PRESETS.find((preset) => preset.id === id) ?? null;
}

export { pocketCsvPreset, urlListPreset };

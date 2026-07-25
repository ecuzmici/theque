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
import { goodreadsPreset } from "@/lib/import/presets/goodreads";
import { imdbListPreset, imdbRatingsPreset } from "@/lib/import/presets/imdb";
import { instapaperPreset } from "@/lib/import/presets/instapaper";
import { pocketCsvPreset } from "@/lib/import/presets/pocket-csv";
import { raindropPreset } from "@/lib/import/presets/raindrop";
import { storygraphPreset } from "@/lib/import/presets/storygraph";
import { urlListPreset } from "@/lib/import/presets/url-list";

export const CSV_PRESETS: readonly CsvPreset[] = [
  goodreadsPreset,
  storygraphPreset,
  imdbRatingsPreset,
  imdbListPreset,
  instapaperPreset,
  raindropPreset,
  pocketCsvPreset,
  // Fallback: must stay last. Instapaper's four-column variant is exactly the
  // shape this one claims, so every real preset has to precede it.
  urlListPreset,
];

export function getCsvPreset(id: string): CsvPreset | null {
  return CSV_PRESETS.find((preset) => preset.id === id) ?? null;
}

export {
  goodreadsPreset,
  imdbListPreset,
  imdbRatingsPreset,
  instapaperPreset,
  pocketCsvPreset,
  raindropPreset,
  storygraphPreset,
  urlListPreset,
};

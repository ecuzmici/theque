/**
 * Bulk import registry.
 *
 * Everything an ingest route or UI needs: the importer list, auto-detection,
 * and the escape hatch for arbitrary CSVs (`csvImporterFromMapping`).
 */

import { csvImporterFromPreset } from "@/lib/import/csv-engine";
import { netscapeBookmarksImporter } from "@/lib/import/parsers/netscape-bookmarks";
import { pocketHtmlImporter } from "@/lib/import/parsers/pocket-html";
import { CSV_PRESETS } from "@/lib/import/presets";
import { fileExtensionOf, type ImportInput, type Importer } from "@/lib/import/types";

/**
 * All importers, in detection order.
 *
 * Pocket's HTML export comes before the Netscape parser: it is bookmark-shaped
 * but flat `<ul>`/`<li>`, and letting the broader bookmark detector see it first
 * would lose the Unread/Archive status split.
 */
export const IMPORTERS: readonly Importer[] = [
  pocketHtmlImporter,
  netscapeBookmarksImporter,
  ...CSV_PRESETS.map(csvImporterFromPreset),
];

export function getImporter(id: string): Importer | null {
  return IMPORTERS.find((importer) => importer.id === id) ?? null;
}

/**
 * Pick an importer for a file.
 *
 * The extension narrows the candidates when it is known, but content sniffing
 * decides — users rename files, and `.txt` bookmark exports exist.
 */
export function detectImporter(
  input: ImportInput,
  importers: readonly Importer[] = IMPORTERS,
): Importer | null {
  const extension = fileExtensionOf(input.filename);
  const candidates = extension
    ? importers.filter((importer) => importer.accepts.includes(extension))
    : importers;

  for (const importer of candidates) {
    try {
      if (importer.detect(input)) return importer;
    } catch {
      /* A detector must never take down detection for the rest. */
    }
  }
  // Fall back to the full list when the extension filtered everything out.
  if (extension && candidates.length !== importers.length) {
    for (const importer of importers) {
      try {
        if (importer.detect(input)) return importer;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

export {
  csvImporterFromMapping,
  csvImporterFromPreset,
  detectCsvPreset,
  parseCsvWithMapping,
  readCsvHeaders,
  readCsvTable,
} from "@/lib/import/csv-engine";
export type {
  CsvColumnMapping,
  CsvFieldSpec,
  CsvHeaderOption,
  CsvLabelsSpec,
  CsvPreset,
  CsvRatingSpec,
  CsvRowContext,
} from "@/lib/import/csv-engine";
export { CSV_PRESETS, getCsvPreset } from "@/lib/import/presets";
export { netscapeBookmarksImporter, parseNetscapeBookmarks } from "@/lib/import/parsers/netscape-bookmarks";
export { parsePocketHtml, pocketHtmlImporter } from "@/lib/import/parsers/pocket-html";
export * from "@/lib/import/rating";
export * from "@/lib/import/types";

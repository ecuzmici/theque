/**
 * Raindrop.io CSV export → category decided by the classifier.
 *
 * 11 lower-case columns:
 * `id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite`.
 *
 * Raindrop is a general-purpose bookmark manager, so a single export mixes
 * recipes, restaurants, products and articles. `category` is deliberately left
 * `null` — `src/lib/classify/` decides per URL, which it does better than any
 * blanket guess this preset could make.
 *
 * ## Traps
 *
 * - `note` is the user's own note (→ `verdict`); `excerpt` is the page's own
 *   summary (→ `description`). Swapping them poisons the taste profile.
 * - `created` is ISO 8601 with milliseconds and a `Z`.
 * - Real exports contain **unquoted multiline values** in `excerpt` and `note`,
 *   which is not valid CSV: the continuation lines arrive as extra records with
 *   the columns shifted. They surface as parse warnings plus per-row skips with
 *   an `invalid_url` reason, rather than as silently mangled items — which is
 *   why the engine reports skips at all.
 * - `folder` is the collection path, nested with `/`.
 */

import type { CsvPreset } from "@/lib/import/csv-engine";

export const raindropPreset: CsvPreset = {
  id: "raindrop",
  label: "Raindrop.io (CSV export)",
  signature: ["id", "title", "url", "folder", "tags", "created", "excerpt"],
  // No category: let the classifier read the URL.
  defaults: { category: null, status: "want" },
  mapping: {
    url: "url",
    external_id: "id",
    title: "title",
    // The user's note, not the page's summary.
    verdict: "note",
    description: "excerpt",
    image_url: "cover",
    created_at_hint: "created",
    labels: {
      columns: ["tags", "folder"],
      // `tags` is one `", "`-delimited cell; `folder` is a `/`-nested path, and
      // each level of it is a label worth keeping. A tag containing a slash is
      // rarer than a nested collection, so the slash counts as a separator.
      separator: /[,/]/,
    },
  },
};

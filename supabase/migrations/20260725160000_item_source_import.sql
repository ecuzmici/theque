/*
  Bulk import: add 'import' to the item_source enum.

  Every existing source names a *single-URL capture* (`chrome_extension`,
  `ios_shortcut`, `manual`, `mobile_share_extension`). Rows created by the bulk
  file importer (`POST /api/import`) are none of those: they came from an export
  file the user already had, carrying title/rating/verdict the app never
  fetched. Recording them as `manual` would make "how did this get here?"
  unanswerable and would poison any later per-source analysis.

  ## Enums and transaction blocks

  `alter type ... add value` could not run inside a transaction block at all
  before PostgreSQL 12. From 12 onward it is allowed, with one restriction: the
  new value may not be *used* in the same transaction that adds it. Supabase
  projects run PG 15+, and this file adds the value without inserting any row
  that uses it, so it is safe whether the runner wraps the migration in a
  transaction (supabase CLI) or not (psql). Application writes with
  `source = 'import'` happen in later, separate transactions.

  If this ever has to run against a pre-12 server, apply it standalone, outside
  any explicit `begin`/`commit`.

  Idempotent: `if not exists` makes a re-run a no-op, matching
  `20260516175257_add_llm_category_source.sql`.
*/

alter type item_source add value if not exists 'import';

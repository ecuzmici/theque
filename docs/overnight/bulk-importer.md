# Overnight idea: Bookmarks / CSV importer

Status: **in progress** (stub marker commit).

Extend the `/add` batch flow with file import so a new user can fill an empty
library in one go from data they already have:

- **Netscape bookmarks HTML** (browser export + Pocket `ril_export.html`)
- **CSV with a URL column** (e.g. newer Pocket CSV export)
- **Goodreads CSV** (no URL column — build `goodreads.com/book/show/<Book Id>`)

Pure, unit-tested parsers under `src/lib/import/`; the UI feeds parsed URLs into
the existing batch-save textarea so the proven save loop handles the rest
(deduped, capped). Attraction + activation; ADR-safe (private, no schema).

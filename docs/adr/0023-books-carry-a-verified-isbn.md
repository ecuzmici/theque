---
status: accepted
---

# Every book carries a verified ISBN

## Context

The item detail page links a book to Goodreads. A Goodreads search for an ISBN opens the book page directly. A search for the title and author opens a result list.

On 2026-11-19, 46 of 179 books had an ISBN. 8 of those ISBNs had a bad check digit. LLM enrichment wrote 4 ISBNs from memory, and 3 of the 4 had a bad check digit. The Google Books resolver did not read ISBNs, and `isbn` did not count as an important book field, so a book without one never reached the resolvers.

A dry run of a Hardcover backfill showed a second problem. The default edition of 10 of 137 books was not English (for example Scythe, Ubik, Leviathan Wakes). Hardcover's language tags are not reliable: it tags a Romanian edition of Scythe as English.

## Decision

1. `src/lib/isbn.ts` validates the check digit of an ISBN-10 or ISBN-13 and removes hyphens. Every ISBN path uses it.
2. The Hardcover resolver reads the ISBN of the default physical edition, then the default ebook edition. It prefers an ISBN from an English-language group (978-0, 978-1, 979-8). When the default editions have none, it takes the most-read edition that has one.
3. The Hardcover resolver accepts a search hit only when its authors overlap the item authors. A title search for "Cat's Cradle" returned a Harold Bloom study guide.
4. The Google Books resolver searches with the first author and takes the ISBN of the first English volume with the same title.
5. Enrichment counts `isbn` as an important book field. It removes a page ISBN with a bad check digit before the resolvers run.
6. LLM enrichment cannot set `isbn` from memory (`VOLATILE_STRUCTURED_FIELDS`). A page-sourced ISBN still passes.
7. `npm run backfill:isbn` fills existing books. It is a dry run unless `--apply` is given, and it accepts a match only when the authors overlap.

## Consequences

- The backfill ran on 2026-11-20: 138 books filled, 1 normalized, 0 failed. 174 of 177 books now have an ISBN, and 173 of them are in an English-language group. A backup of the previous values is in `.agent/isbn-backup-2026-11-20.json` (not in git).
- Three books have no ISBN: Cat's Cradle (no source has the English edition under that query) and two manhwa chapter pages. The Goodreads link falls back to a title search.
- Each book enrichment that lacks an ISBN costs one more Hardcover request (the edition query).

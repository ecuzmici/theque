---
status: accepted
---

# Bulk import: one CSV engine + a preset registry, trust the file and drain later

Everything entered thèque one URL at a time — extension, capture API, manual add.
A new user therefore landed on an empty shelf and had to earn their library by
hand, including the specific visitor `/pocket-alternative` was built to attract,
who already has an export file sitting on disk. The cost compounds because the
recommender is **verdict-driven** (ADR 0002): good recommendations need
accumulated ratings, so with one-at-a-time entry the product's best feature is
back-loaded by months. An import that carries ratings across is the shortest path
from "empty" to "the recommender has something to work with".

This ADR records the import chassis (W5a), the verified presets and the
Letterboxd archive parser (W5b), and the ingest API + wizard (W6).

## Decisions

### A generic CSV engine plus a preset registry, not N bespoke parsers

`src/lib/import/csv-engine.ts` owns all the grubby shared work once — RFC-4180
quoting, BOM, CRLF, duplicate headers, Excel's `="…"` escaping, rating-scale
normalization, skip accounting, row caps. A source is then a **declarative
column mapping** of ~15–100 lines in `src/lib/import/presets/`, registered in
one array. Adding Goodreads, StoryGraph, IMDb (ratings and list), Instapaper,
Raindrop and Pocket CSV touched `csv-engine.ts` zero times.

Parsing itself is delegated to **papaparse**, with `header: false` and the header
index built by hand. Hand-rolled comma splitting is the single most likely source
of silent corruption here: review text containing commas, embedded quotes and
literal newlines inside quoted fields is a certainty in any real Goodreads or
Letterboxd export, not an edge case. papaparse's own header mode is avoided
because it is **last-wins on duplicate column names**, and real exports contain
duplicates.

### Detection by header signature, never by filename

Users rename files, re-save them out of Excel, and export `.txt` bookmarks.
`detectImporter` uses the extension only to *narrow* candidates and falls back to
the full list if that filter finds nothing; the decision is always content
sniffing. Registry order is load-bearing in two places, both documented at the
call site: `pocket-html` must precede the generic Netscape parser (Pocket's
export is bookmark-shaped but flat, and the broader detector would swallow the
Unread/Archive split), and `url-list` must stay last (Instapaper's four-column
variant is exactly the shape it claims).

### `CsvColumnMapping` accepts only column *names* — positional mapping is unrepresentable

This is a type-level decision, not a style preference. Goodreads moved its
`Owned Copies` column between the 31-column pre-2022 export and today's
24-column one. Positional parsing does not fail on the older file; it reads the
wrong column and writes plausible-looking wrong data. Making position
inexpressible in the mapping type means no preset can ever regress into it, and
each preset parses **both era variants** by naming the columns each era has.

Header lookup is normalized for case, BOM, Excel escaping and `_`/`-` folded to
spaces, so a preset can write `"Time Added"` and match `time_added`.

### "Trust the file, drain later"

Imported rows are inserted with whatever the export gave us — title, rating,
verdict, `done_at`, `created_at` hint — and `processing_status = 'pending'`, so
`claim_pending_enrichment_items` still picks them up for covers and structured
fields. The export metadata is usually better than what a scrape would produce
anyway (a Goodreads CSV knows the user's own rating; the page does not).

The change that made this real is in `ItemCard`: the shimmer placeholder is now
conditioned on **having no title**, not on being unenriched. Before, a
pending-but-titled row rendered as an anonymous loading block, so a 400-row
import produced 400 identical shimmers — the shelf looked broken rather than
full. Now it renders as a real card immediately and the cover fills in later,
which is the entire point of trusting the file.

Enrichment is deliberately **not** kicked off by the import route: firing
hundreds of `after()` fetches would blow the function budget and hammer the
source sites.

### "Later" needed a faster drain than the nightly cron

The nightly cron claims a **globally fair** slice (`batch_size` with a
`per_user_cap`), which is correct for shared background work and exactly wrong
for the person staring at 400 blank cards they imported ninety seconds ago — at
one small per-user slice per night, the shelf fills over months. thèque is a
*visual* library, so a coverless shelf is a broken shelf.

`POST /api/items/enrich-pending` lets the signed-in user drain **their own**
backlog in bounded slices while the wizard shows the count going down. The
design points worth keeping:

- **One claim path, extended — not a second one.** Migration
  `20260725180000_claim_enrichment_target_user.sql` adds an optional
  `target_user` to `claim_pending_enrichment_items`. A second claim function
  would be a second place to get `for update skip locked` wrong.
  `target_user is null` preserves the cron's exact behaviour; a non-null value
  restricts the candidate set to that user and drops the per-user cap (capping a
  batch that belongs to one user by construction is just a smaller batch).
  The old 1- and 2-argument signatures are **dropped**, not left alongside:
  `create or replace` with a different argument count creates an *overload*, and
  the cron's existing named call would then match two candidates and error on
  ambiguity. Dropping first is deploy-safe in either order.
- **This is the most abusable surface in the app** — every claimed row is an
  outbound fetch to a third-party site the caller chose. Three bounds: a
  small per-request batch that always finishes inside the function budget, its
  own rate-limit bucket, and the claim itself (`target_user` is the *session*
  user, so the ceiling on everything this route will ever fetch is the caller's
  own pending rows, already capped by `MAX_ITEMS_PER_USER`).
- **Stale-`processing` recovery became user-scopable.** The sweep moved into
  `src/lib/jobs/enrich-queue.ts` and takes an optional `userId`: the cron sweeps
  everyone, the interactive drain sweeps only the caller, so someone who closed
  the tab mid-batch gets their own rows back on their next visit instead of
  waiting for the nightly run.
- The cron itself is now budget-bounded by the **clock** (`CRON_BUDGET_MS`
  under `maxDuration = 60`) rather than by batch size, so it stops starting new
  items with enough slack to release the rest instead of being killed with rows
  still marked `processing`.

### Batched insert, not a loop over `/api/capture`

`/api/capture` is rate-limited to 60 requests / 60s per user and enriches inline.
A 400-row Pocket export through that path is roughly seven minutes, most of it
429s. `POST /api/import` takes an already-parsed batch and inserts it in one
round trip per 100-row chunk, with a 500-row transport cap per request (the
parser's own file cap is 5000 — the two are independent: one bounds memory, the
other bounds an HTTP body). The wizard uploads in 250-row chunks, which also
gives the UI a natural progress tick and limits the blast radius of one failed
chunk to 250 rows.

**Dedup comes free from the schema.** `items` already carries
`unique (user_id, url_fingerprint)`, so the insert is an upsert with
on-conflict-**do-nothing**: re-importing the same file is a no-op by
construction rather than by a pre-flight `select` that races itself, and the
difference between rows sent and rows returned *is* the duplicate count.

Quota is handled by importing what fits: `checkQuota` answers "may they write at
all", a separate count answers "how many more", and the remainder past
`MAX_ITEMS_PER_USER` comes back as **rejected rows with a reason** rather than an
opaque mid-file failure.

### Every skipped row carries a reason

`ImportSkip` / `ImportRejection` always name a machine reason and, where
knowable, the file and 1-based line. An importer that silently drops 40% of a
file destroys trust faster than one that refuses outright, and the user is the
only person who can look at their own file and judge whether a drop was correct.
The skip list is capped (`IMPORT_MAX_SKIPS = 200`) so a pathological file cannot
produce a multi-megabyte error payload; the overflow becomes a warning.

Parsers also keep `source_ref` — importer id, source external id, **`raw_rating`
before normalization**, file, line. `rating_personal` alone cannot tell you
whether a 4 came from 4/5, 8/10 or four stars, so a mis-mapped scale would
otherwise be undebuggable after the fact. `url` is likewise kept **raw**;
canonicalization and fingerprinting are the ingest layer's job (`src/lib/url/`),
because a parser that normalizes eagerly destroys the evidence needed to explain
a dropped row.

### Hybrid client/server parsing, forced by the dependency graph

CSV parsing is isomorphic (papaparse), so the wizard parses CSV/TSV/plain-URL
files **in the browser** and those files never leave the machine. The
bookmark-shaped parsers are not isomorphic — `netscape-bookmarks` and
`pocket-html` parse tag soup with **jsdom**, which is Node-only — and the
Letterboxd importer reads raw ZIP bytes. Those go to `POST /api/import/parse`, a
**read-only** endpoint that returns an `ImportParseResult` for the preview step
and writes nothing; the rows only reach the database after the user confirms.

The hazard this creates is recorded in the wizard itself: it imports **leaf
modules** (`@/lib/import/csv-engine`, `.../presets`, `.../rating`,
`.../types`) and never the package index `@/lib/import`, because the index pulls
in the jsdom-backed parsers and would drag jsdom into the client bundle. This is
invisible in review — the import looks tidier — so it is commented at the import
site and stated here.

The parse endpoint caps uploads at 4 MB (Vercel's serverless body limit is
4.5 MB) so the user gets an actionable message instead of a platform 413; real
exports are far smaller, a 5000-item Pocket HTML export being around 1 MB. It has
its own rate-limit bucket because it is CPU-bound in a way the insert route is
not.

### Letterboxd is keyed on `(Name, Year)` and never on `Letterboxd URI`

The single most important finding in the whole feature, because getting it wrong
fails **silently**. The archive contains five CSVs whose `Letterboxd URI` column
means two different things:

- In `ratings.csv`, `watchlist.csv`, `watched.csv` it is **film-level and
  globally stable** (`https://boxd.it/jWEA` is Knives Out in everyone's export).
- In `diary.csv` and `reviews.csv` it is **entry-level and per-user** — the same
  film watched twice yields two different URIs, present in no one else's export.

So joining diary to ratings on the URI matches *nothing*: every rating would be
dropped while the import still reported success. And deduping diary rows on the
URI fails to collapse rewatches, importing one film twice. Identity is therefore
`(Name, Year)`, and the five files merge into one row per film: the film-level
URI for `url`, `ratings.csv` for the rating, the latest review for the verdict,
the latest `Watched Date` for `done_at`.

Related traps, all recorded in the parser: `deleted/` and `orphaned/` mirror the
same filenames and schemas, so only entries at the **archive root** are read (a
recursive glob double-imports the library); `lists/` is skipped as curation
rather than library, and its presence is reported as a warning; 2017-era exports
write full canonical URLs instead of `boxd.it` shortlinks, and `boxd.it`
redirects are **not** followed (that would be one HTTP round-trip per row).

### `0` means unrated, and it is normalized centrally

Goodreads, MyAnimeList, Discogs and Paprika all write `0` into the rating column
for items the user never rated, and a large export is *mostly* unrated rows.
Importing those as 1★ would feed thousands of fabricated "I hated this" signals
straight into the taste profile that ADR 0002 built the product on — the fastest
possible way to poison the one asset that differentiates thèque. Every
normalizer in `src/lib/import/rating.ts` maps `0`, blank, absent and non-numeric
to `null`, and parsers are forbidden from emitting a foreign scale.

The normalizers also absorb Excel's `="4"` escaping and EU decimal commas
(`4,5`), because export files are routinely opened and re-saved in a spreadsheet
before anyone sends them anywhere.

### Dates resolve as UTC

Excel-round-tripped exports carry `8/10/2023`, and `new Date()` parsed those in
the *server's* local timezone — the same file produced different `done_at`
values depending on where the parse ran, which for a hybrid client/server split
means depending on whether the user's browser or a Vercel region did the work.
`toIsoDate` now constructs dates explicitly in UTC, accepts `YYYY/MM/DD`,
`M/D/YYYY` (US order, the only order Excel's en-US locale emits) with `D/M/YYYY`
as a fallback when the first number cannot be a month, and unix timestamps.

### `item_source = 'import'`

Every pre-existing `item_source` value names a single-URL capture
(`chrome_extension`, `ios_shortcut`, `manual`, `mobile_share_extension`).
Recording imported rows as `manual` would make "how did this get here?"
unanswerable and poison any later per-source analysis. The enum migration is
`if not exists` and adds the value without using it in the same transaction,
which is the one restriction `alter type … add value` carries from PostgreSQL 12
onward.

### Bookmark-format details worth keeping

- The Netscape parser walks anchors in **document order** and reconstructs folder
  paths from ancestors rather than assuming a root `<DL>`: Safari emits no root
  wrapper, no timestamps, and a valueless `<H3 FOLDED>`, so the textbook
  approach misbehaves on it silently.
- `ADD_DATE` values at or above `1e15` are rejected as out of range — that is
  Chrome's internal `Bookmarks` JSON, which stores microseconds since the 1601
  epoch, and users routinely confuse the two files.
- Unsafe schemes and `ICON` favicon payloads never become rows.
- Pocket's export is **not** Netscape format despite looking like it, and its two
  formats disagree with each other: the HTML uses comma-delimited tags, the CSV
  uses pipes. Status matching tests `archive` **before** `unread`, because
  "Unread" contains "read". Archived items get **no fabricated `done_at`** —
  `time_added` is when it was saved, not when it was read.

### Two latent bugs found and fixed on the way

- **Enrichment un-doning imported items.** `enrichItem` recomputed `status` from
  category confidence and would have flipped an imported `done` row back to
  `want`/`inbox` while keeping its rating, verdict and `done_at` — stranding
  exactly the verdict data the import exists to carry. Enrichment now never
  overwrites a `done` status. This was already wrong for *any* re-enriched done
  item; import only made it reachable at scale.
- **Unbounded polling.** `LibraryItemsSection` polled `/api/items` every 2s for
  as long as any visible row was pending. An import makes that effectively
  unbounded — hundreds of rows pending until the cron drains them, from every
  open tab. Polling is now capped at ~3 minutes, with realtime still delivering
  enriched rows afterwards.

## Sources deliberately rejected

- **RIS / BibTeX** (Zotero, Mendeley, academic managers). Their URL field is
  typically a DOI or a publisher paywall landing page, not something thèque can
  enrich into a card. Importing them would manufacture Inbox debris at volume —
  the exact opposite of the "shelf is browsable immediately" goal — and the
  categories they represent are not ones the product has a shelf for.
- **Pinterest.** It is unverified whether the export carries the **original
  destination URL** or only Pinterest's own pin permalink. Without that, every
  imported row points at Pinterest rather than at the thing the user saved, and
  we could not confirm which it is from any source we trust. Not shipped on a
  guess.
- **Linkwarden.** It *imports* Netscape HTML but does not appear to **emit** it;
  its own export format was not verified. Assuming symmetry there is precisely
  the class of assumption that produced the Letterboxd URI trap.

The common rule: a preset is cheap to add later (that is the point of the
registry), and shipping one built on an unverified column layout is more
expensive than not shipping it, because the failure mode is silently wrong data
in the user's library rather than an error.

## Research provenance (read this before adding a preset)

Every column name in every preset was verified against **real export files
committed as fixtures** (`src/lib/import/fixtures/`) and, where a fixture was not
obtainable, against the vendor's **own exporter source code**. This was not the
plan; it became the method because vendor help pages were largely unreachable
during the work. Fixtures for both era variants are committed where the format
changed, which is what makes "parses both eras" a testable claim instead of an
intention.

One warning worth carrying forward: the widely repeated claim that **Letterboxd
data export requires Pro** traces back to a *single AI-generated article*
syndicated across a set of hijacked domains — the same text, same errors,
different sites, no primary source anywhere in the chain. It reads exactly like
consensus. Treat multi-site agreement about an export format as one source until
a primary artifact (a real file, or the vendor's exporter code) confirms it; the
cost of getting this wrong is a source you never build or a mapping that is
silently wrong.

## Consequences

- **New public module** `src/lib/import/` with a stable contract (`ImportRow`,
  `ImportSkip`, `Importer`) that is deliberately free of source-specific
  concepts. Adding a source should mean a preset file plus a fixture plus a test,
  and nothing else.
- **New dependencies**: `papaparse` (isomorphic, ships to the client) and
  `fflate` (ZIP). `jsdom` stays server-only and must remain unreachable from the
  wizard's import graph — the leaf-import rule is the only thing enforcing that,
  and it is not enforced by a lint rule.
- **New routes**: `POST /api/import` (session, batched insert) and
  `POST /api/import/parse` (session, read-only), plus `/settings/import`. Both
  documented in `docs/api-contract.md`.
- Import is the first path that writes `status = 'done'`, `rating_personal` and
  `verdict` **without** the app's own done-flow, which is what exposed the
  enrichment status bug above. Anything that recomputes item state from
  enrichment output now has to account for rows whose truth came from a file.
- Notes/verdicts from imports are encrypted at the route boundary like every
  other write (ADR 0013).

## Not yet true (state at the time of writing)

- **Two migrations are written and deliberately not applied** — local development
  shares the production Supabase project.
  `20260725160000_item_source_import.sql` adds the enum value; until it runs,
  `POST /api/import` detects the missing value and returns
  `503 import_source_unavailable` naming the migration file rather than 500-ing,
  which means **no import can succeed anywhere until it is applied**.
  `20260725180000_claim_enrichment_target_user.sql` adds `target_user`; until it
  runs, `POST /api/items/enrich-pending` has no user-scoped claim and the
  interactive drain does not work.
- The presets have been validated against committed fixtures and unit tests, not
  against a full-size real export end-to-end through the wizard. Row caps, chunk
  boundaries, progress reporting and the rejection UI at 5000 rows are untested
  at that scale.
- **Enrichment throughput is designed but unmeasured.** The interactive drain
  exists in code; nobody has run a real 400-row import through it and timed how
  long the shelf takes to fill, how many rows fail, or what a third-party site
  does when it sees a burst of fetches from one user. The nightly cron's real
  capacity under `CRON_BUDGET_MS` is likewise unobserved in production.
- `/pocket-alternative` still tells visitors there is no one-click Pocket
  importer. That copy predates this work and is now wrong.

## Open questions

- **Labels are parsed and dropped.** `ImportRow.labels` carries folders, shelves
  and tags, and nothing consumes them — collections and tags were removed as
  unused. A Goodreads "read/to-read/currently-reading" shelf or a Pocket tag is
  real user structure being discarded at the boundary. Either map a small,
  fixed set of them onto `status`/`category` or state plainly that they are lost.
- **Category assignment** follows an unwritten rule that should probably be
  written down: single-topic sources assert outright (Goodreads/StoryGraph →
  `books`, IMDb/Letterboxd → `movies_and_tv`, Instapaper/Pocket → `articles`),
  while mixed sources defer to `src/lib/classify/` (Raindrop, bookmark HTML,
  plain URL lists). The consequence of deferring is that a bookmark export lands
  largely in **Inbox** until enrichment runs — a browser-bookmarks import may
  therefore look like a pile of unclassified debris on arrival, which is in
  tension with "the shelf is browsable immediately". Whether Inbox triage is an
  acceptable landing zone for a 500-row bookmark import is untested with a real
  user.
- **Undo.** There is no "undo this import". Dedup makes a re-run harmless, but
  nothing removes a 400-row mistake except deleting rows one at a time. The
  `source_ref` provenance is sufficient to build it; the UI is not there.
- **Partial-chunk failure** is reported as `insert_failed` rejections and the
  user is told to re-run, which dedup makes safe. Whether that is good enough,
  or whether the wizard should retry the chunk itself, is unresolved.

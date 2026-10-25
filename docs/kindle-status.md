# Kindle jailbreak — status at 2026-08-20

Context for wiring theque up to the Kindle. The full reference — every gotcha,
path and undo — is `C:\Users\emilc\projects\KINDLE_JAILBREAK_HANDOVER.md`
(REV 4), **outside this repo**, on the Windows side. The Kindle project lives in
`C:\Users\emilc\projects\`.

> **Note for a future session:** `C:\Users\emilc\projects\bookmarkly` is a
> **stale clone of this repo** — 152 commits, last touched 2026-06-19, missing
> the entire `feat/kobo-epub-sync` work. This repo (`~/code/theque`, 245
> commits) is the real one. Do not read theque from the Windows path.

## The Kindle, in short

| | |
|---|---|
| Device | Kindle Paperwhite 5 (11th gen, `1PX`), firmware `5.16.7`, frozen |
| Jailbreak | Nosebleed `jb.sh v1.3.7`. **OTA disabled** (`otaupd`/`otav3` → `.bck`), `factory_reset` disabled too |
| Reader | KOReader v2026.07.1, 12 third-party plugins, SimpleUI front end |
| Mount | `E:\` = `/mnt/us`, FAT32 mass storage. 5.29 GB free of 6.23 GB |
| Library | 104 EPUB + 1 MOBI, flat in `E:\documents\` |
| Dictionary | Wiktionary EN–EN, 785k words, installed |

Library metadata, verified against the files themselves:

- **104/104 carry exactly one `dc:subject`: the genre.** Ratings used to sit
  beside the genre as `★ 4.2`, which made KOReader's Keywords row read
  `['Fantasy', '★ 4.5']` — KOReader cannot tell a genre subject from a rating
  subject, it is one field. Removed 2026-08-19. **Do not put ratings in tags.**
- **100/104 have a description.** The 4 without need hand-written text.
- Genres come from a curated 13-genre taxonomy: Space Opera, Post-Apocalyptic,
  Fantasy, Hard SF, AI & Robots, Literary, Weird & Literary SF, Thriller,
  Time & Reality, Classics, Superhero, Nonfiction, Graphic Novel.

Open items: verify the dictionary on-device (long-press a word), and the 4
missing descriptions. Closed and not to be reopened: collections, Hardcover
linking, Bookshelf nav bar, font renaming.

## Kindle-side tooling (`C:\Users\emilc\projects\`)

| Script | What it does |
|---|---|
| `kindle_backup.ps1` | Snapshots the irreplaceable device state (~51 MB, seconds), verifies 6 key files |
| `add_book.py` | Add a book end-to-end: refuse Amazon formats → calibre → classify genre → fetch description → embed into the EPUB → copy to device |
| `genre_ai.py` | Gemini genre classifier, enum-constrained to the 13 genres. **82%** against the curated tags on a 40-book eval; the keyword fallback scored 18% |

`genre_ai.py` reads `GEMINI_API_KEY` from the environment, falling back to
**this repo's `.env.local`** (the Windows path, which still resolves). That is
the only existing coupling between the two projects. It never prints the key.

## Wiring theque to the Kindle

**Most of the pipeline already exists.** `feat/kobo-epub-sync` built book-file
handling end to end for a Kobo Clara BW; the Kindle needs the last mile only.

What is already built:

- **`items` carries one book file** — `file_drive_id`, `file_name`,
  `file_bytes`, `file_sha256`, `file_uploaded_at`
  (`supabase/migrations/20260811120000_item_epub_file_columns.sql`). A check
  constraint keeps all five null or all five set; `file_sha256` detects a
  re-upload of the same file.
- **Upload route** — `POST /api/items/[id]/file` (session auth). It tests the
  zip magic bytes rather than trusting the filename, rejects >
  `MAX_BOOK_FILE_BYTES` (**30 MB**), **patches the EPUB metadata from the theque
  item** (`epubPatchFromItem`), converts to KEPUB, and uploads to Google Drive.
- **Upload UI** — `src/components/items/BookFileField.tsx`.
- **EPUB library** — `src/lib/epub/`: `metadata.ts` (read/write OPF),
  `kepub.ts`, `filename.ts`, `from-item.ts`, all with tests and a real EPUB
  fixture.
- **Storage** — Google Drive, not Supabase Storage. `src/lib/drive/client.ts`,
  `drive.file` OAuth scope, `GOOGLE_DRIVE_FOLDER_ID`, `npm run drive:create-folder`.
  The folder is shared **Anyone with the link / Viewer**.
- **Delivery to the Kobo** — KoboCloud on the device pulls from that Drive
  folder on sync. See `docs/sessions/kobo-device-setup.md`.

Note that theque's metadata patch step is the exact analogue of the Kindle
side's `calibredb embed_metadata`: both exist because a reader shows what is
**inside** the file, not what a database says.

### What the Kindle actually needs

Three gaps, in order of importance:

1. **KOReader cannot fetch from Google Drive.** `cloudstorage.koplugin` supports
   **Dropbox, WebDAV and FTP only**. The KoboCloud trick does not translate, so
   the Drive folder alone gets you nothing on the Kindle.
   **`opds.koplugin` is installed on the device** and KOReader speaks OPDS with
   per-catalog HTTP Basic auth. An OPDS catalog served by theque, whose
   acquisition links point at a theque route that streams the Drive file, is the
   natural fit — and `src/app/share/[token]/page.tsx` is a proven
   unauthenticated-token pattern to copy (service-role query, `noindex`).
   `src/lib/auth/capture-token.ts` already does hashed bearer validation if a
   header scheme is preferred.
2. **Only the KEPUB is stored.** The upload route reassigns `bytes` to the
   converted output, so the plain EPUB is not kept and there is no
   kepub→epub path. KEPUB *is* valid EPUB and KOReader will very likely open it,
   but this is **unverified** — test one before designing around it. Cleanly,
   `buildKoboFilename()` already takes an extension and `EPUB_EXTENSION` already
   exists, so making conversion conditional per target device is a small change.
   Note the `.kepub.epub` name is meaningful to a Kobo and meaningless on a Kindle.
3. **Filenames are Kobo-shaped** — `Author - Title (Series 02).kepub.epub`, from
   `buildKoboFilename()`. The Kindle library is flat with Calibre-style
   sort-names (`Trade of Blood, A - Robert Jackson Bennett.epub`) and KOReader's
   `collate` is set to `"title"` so it sorts on the embedded title rather than
   the filename. Either convention works; just do not assume they match.

### Non-negotiable

**Whatever theque serves the Kindle must be EPUB (or KEPUB, pending the test in
gap 2).** KOReader cannot read AZW3 or KFX. This is also why Send to Kindle is
useless here — Amazon converts everything you send into those formats, so an
emailed book arrives unreadable. Seven KFX files had to be deleted during the
original migration for exactly this reason.

## Secrets

`.env.local` holds `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY`, `CRON_SECRET` and the `GOOGLE_DRIVE_` OAuth variables. It is
gitignored — keep it that way, and never print or commit its contents. The
Kindle project has its own secret at `C:\Users\emilc\projects\.hardcover_token`.

## Undo

`kindle_backup.ps1` snapshots live in
`C:\Users\emilc\projects\kindle_state_<timestamp>\`.
`kindle_migration_backups\` holds the pre-migration device state (522 files,
every original AZW3), calibre DB backups, and previous handover revisions.
Restore with `-LiteralPath`, KOReader closed.

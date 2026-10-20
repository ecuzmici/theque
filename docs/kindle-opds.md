# Kindle books through OPDS

A jailbroken Kindle that runs KOReader can get EPUB files from theque. KOReader reads the theque OPDS catalog. The catalog lists the books that have a file. KOReader downloads a book from the catalog.

## Kindle and Kobo targets

Each user has one target. `bookFileTarget` in `src/lib/book-file-access.ts` sets it.

| Target | Users | File | Drive folder |
|--------|-------|------|--------------|
| `kindle` | `BOOK_FILE_KINDLE_USER_IDS` | Plain EPUB, name ends in `.epub` | `GOOGLE_DRIVE_KINDLE_FOLDER_ID` (private) |
| `kobo` | All other users | KEPUB, name ends in `.kepub.epub` | `GOOGLE_DRIVE_FOLDER_ID` (public) |

The Kobo folder is public. A Kobo device syncs every file in it. Thus a Kindle file must never go to that folder. When `GOOGLE_DRIVE_KINDLE_FOLDER_ID` is empty, a Kindle upload fails with `drive_not_configured`.

The upload route (`POST /api/items/:id/file`) and `npm run book:attach` use the same target. The script uses the target of the item owner.

## 1. Make the private folder

Run this command one time:

```bash
npm run drive:create-folder -- --private "Kindle"
```

The script makes the folder through the Drive API. It does not share the folder. The script prints the folder id.

Do not make the folder in the Drive web UI. The `drive.file` scope shows the app only the folders that the app made. An upload to a folder from the web UI fails with a 404.

## 2. Set the variables

Set these variables in `.env.local` and in Vercel:

| Variable | Value |
|----------|-------|
| `GOOGLE_DRIVE_KINDLE_FOLDER_ID` | The folder id from step 1. |
| `BOOK_FILE_KINDLE_USER_IDS` | The user ids of the Kindle users. Use a comma between two ids. When the variable is empty, the code default applies. |

The Kindle user must also be on `BOOK_FILE_USER_IDS`, or on its code default. That list controls who can upload a book file.

## 3. Attach the books

Upload an EPUB on the item page, or run `npm run book:attach`. A book file that a Kindle user uploaded before this change stays in the Kobo folder. Upload the file again to move it. The new upload deletes the old file.

## 4. Connect KOReader

1. Open Settings in theque. Go to **Capture tokens**. Make a token. Copy it. theque shows the token one time only.
2. On the Kindle, open KOReader.
3. Open the search menu. Select **OPDS catalog**.
4. Select **+** to add a catalog.
5. Type a name, for example `theque`.
6. Type the URL `https://theque.app/opds`.
7. Type a username. theque does not read it, but do not leave it empty.
8. Type the capture token as the password.
9. Select **Save**.

Add a second catalog for the sync mode. Use the URL `https://theque.app/opds/new` and the same username and password. Turn on **Sync catalog** for that catalog.

## Catalog URLs

| URL | Kind | Content |
|-----|------|---------|
| `https://theque.app/opds` | Navigation | The browse catalog. Use this URL to browse. |
| `https://theque.app/opds/new` | Acquisition | The sync catalog. All books with a file, newest upload first. |
| `https://theque.app/opds/books?shelf=up-next` | Acquisition | Books that are not done, newest first. |
| `https://theque.app/opds/books?shelf=finished` | Acquisition | Done books, by title. |
| `https://theque.app/opds/books?shelf=all` | Acquisition | All books, by title. |
| `https://theque.app/opds/moods` | Navigation | Moods that have one or more books. |
| `https://theque.app/opds/genres` | Navigation | Book genres that have one or more books. |
| `https://theque.app/opds/books?shelf=all&mood=<key>` | Acquisition | The books of one mood. |
| `https://theque.app/opds/books?shelf=all&genre=<key>` | Acquisition | The books of one genre. |
| `https://theque.app/opds/file/<itemId>` | File | The EPUB of one item. |

The sync catalog never filters by shelf, mood or genre. KOReader reads it from the top. It stops at the entry that it saved at the previous sync. Each entry has one link to the file. The entries have no navigation links.

## How the catalog works

- Auth is HTTP Basic. The password is a capture token (`bmly_…`). A missing or bad token gets a 401.
- The catalog shows only the books of the token owner. It shows only books that have a file. It never shows a dismissed book.
- A download writes the current item data into the EPUB: title, authors, description, series, genres and moods. Each genre becomes a `dc:subject`, for example `Fantasy`. Each mood becomes `Mood: <Label>`, for example `Mood: Cozy`. Thus a book gets new tags without a new upload.
- A KEPUB file (a Kobo user) goes out as stored.
- The file route sends the body in chunks of 256 KB, because Vercel limits a response that is not streamed to 4.5 MB.
- The catalog has a rate limit per user.

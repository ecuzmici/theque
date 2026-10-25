# Kobo series metadata — open problem and handoff

Status: open. Nobody works on this now. Emil gave it low priority.

Symptom: theque writes a series name into each EPUB file. The Kobo Clara BW
does not show the series. Every other part of the pipeline works.

## What already works

Do not rebuild these parts. They are on `master` and they have tests.

| Part | Path |
|------|------|
| Read and write EPUB metadata | `src/lib/epub/metadata.ts` |
| Convert EPUB to KEPUB | `src/lib/epub/kepub.ts` |
| Map an item row to a metadata patch | `src/lib/epub/from-item.ts` |
| Build the Kobo file name | `src/lib/epub/filename.ts` |
| Upload to Google Drive | `src/lib/drive/client.ts` |
| Attach a file to an item | `src/app/api/items/[id]/file/route.ts` |

Commits: `7a13fb3`, `db3a446`, `af25325`, merged as `8c45d89`.

The device pulls the files from one public Google Drive folder. KoboCloud
runs on the device and downloads new files on each WiFi sync. See
`docs/sessions/kobo-device-setup.md`.

## What the code writes today

`src/lib/epub/metadata.ts` writes the legacy calibre pair into the OPF
`<metadata>` element:

```xml
<meta name="calibre:series" content="The Mistborn Saga"/>
<meta name="calibre:series_index" content="1"/>
```

The constants are `SERIES_KEY` and `SERIES_INDEX_KEY` at lines 10 and 13.
The write happens in `setNamedMeta`, called near line 262. The read happens
near line 210.

The values come from `structured.series` and `structured.series_index` on the
item row. The Hardcover resolver supplies them. See
`src/lib/enrichment/resolvers/hardcover.ts`.

## The hypothesis, not yet tested

Kobo may read the EPUB3 collection form, not the legacy calibre form. The
EPUB3 form looks like this:

```xml
<meta property="belongs-to-collection" id="c1">The Mistborn Saga</meta>
<meta refines="#c1" property="collection-type">series</meta>
<meta refines="#c1" property="group-position">1</meta>
```

Note the difference. The legacy form uses the `name` and `content` attributes.
The EPUB3 form uses the `property` attribute and puts the value in the element
text. `metadata.ts` handles only the `name` form today. Look at `readSeries`
and `setNamedMeta`, which both filter on `attrOf(entry, "name")`.

Confidence: low. Nobody has tested this. Treat it as a starting point.

## Test the hypothesis before you write code

This step costs about 15 minutes. Do it first. It decides whether the fix is
worth building.

1. Take one book file that shows no series on the device.
2. Open its OPF and add the three EPUB3 lines above by hand. Keep the calibre
   pair as well.
3. Repack the file. Keep `mimetype` first and uncompressed.
4. Upload the file to the Drive folder by hand.
5. Sync the device and look at the book.

If the series appears, build the fix. If it does not, the cause is elsewhere
and the list below gives the next places to look.

## Other possible causes

Check these if the manual test fails.

1. The device may read a series only from its own database. The calibre
   KoboTouchExtended driver writes the `Series` and `SeriesNumber` columns in
   `KoboReader.sqlite` over USB. KoboCloud cannot do this. It only copies
   files. If this is the cause, no change to the file can fix it.
2. The KEPUB conversion runs after the metadata write. Confirm the conversion
   keeps the OPF unchanged. `src/lib/epub/kepub.ts` must not touch it.
3. The device may need a full library rescan. KoboCloud calls
   `pfmRescanBooksFull` through NickelDBus.

## If you build the fix

1. Write both forms. Keep the calibre pair, because calibre and other tools
   read it. Add the EPUB3 collection form next to it.
2. Give the collection element a unique `id`. The two `refines` elements must
   point at that same id with a `#` prefix.
3. Replace an existing EPUB3 collection block. Do not add a second one.
4. Extend `readSeries` to read both forms. Prefer the EPUB3 form.
5. Reuse `rebuild()` in `metadata.ts`. Do not write a second archive writer.
   JSZip invents parent directory entries without `createFolders: false`. A
   real Gutenberg EPUB went from 41 entries to 43 because of this. There are
   regression tests.

## Verification gates

1. `npx tsc --noEmit 2>&1 | grep -cE "error TS"` must print the same count as
   before your change. The repository has pre-existing unrelated errors.
2. `npm test` must pass fully.
3. Round-trip a real EPUB, not only a synthetic fixture. The synthetic
   fixtures passed while a real file exposed the JSZip bug above.

## Related traps, already found

1. `buildKoboFilename` needs the correct extension. A KEPUB file must keep the
   `.kepub.epub` name. A `.epub` name demotes the file to plain EPUB handling.
2. Bulk re-enrichment overwrites the item `status` column. Only `done_at`
   survives. Restore a read state from `done_at`.
3. KoboCloud downloads with `curl -C -`. A changed file under an unchanged
   name can corrupt the copy on the device. Change the file name when the
   content changes.

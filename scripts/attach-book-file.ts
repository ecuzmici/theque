/**
 * Operator tool: attach an EPUB to a book item without a browser session.
 *
 * The script runs the same pipeline as `POST /api/items/[id]/file`: it reads
 * the item, writes the theque metadata into the EPUB, converts the file to
 * KEPUB, builds the Kobo file name, uploads the file to the Drive folder, and
 * writes the five `file_*` columns in one statement. It uses the service-role
 * client, so it can attach a file to an item that belongs to another profile.
 *
 * The item owner sets the target (`bookFileTarget`). A kindle owner gets a
 * plain `.epub` in GOOGLE_DRIVE_KINDLE_FOLDER_ID, with no KEPUB step. A kindle
 * file never goes to the public Kobo folder.
 *
 * Usage:
 *   npm run book:attach -- <itemId> <path/to/book.epub>
 *   npm run book:attach -- --manifest books.tsv --dir books
 *   npm run book:attach -- --manifest books.tsv --dry-run
 *
 * A manifest line holds an item id, a file name and an optional label,
 * separated by tabs. A line that starts with `#` is a comment. The script
 * resolves each file name against `--dir` (default `books`).
 *
 * A dry run does every local step and prints the result. It uploads nothing
 * and writes nothing.
 *
 * The script is safe to re-run. It hashes the converted bytes and skips an
 * item whose row already holds that digest, so a batch that stops halfway
 * only repeats the work it did not finish.
 *
 * (The npm script passes --conditions=react-server so the "server-only" guard
 * in the imported EPUB and admin modules resolves to its no-op build.)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + the Drive
 * OAuth variables in env (or .env.local), plus GOOGLE_DRIVE_FOLDER_ID for a
 * kobo owner or GOOGLE_DRIVE_KINDLE_FOLDER_ID for a kindle owner.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { loadEnvConfig } from "@next/env";

import { bookFileTarget } from "../src/lib/book-file-access";
import { deleteDriveFile, DriveError, isDriveConfigured, uploadEpub } from "../src/lib/drive/client";
import { buildKoboFilename, EPUB_EXTENSION, KEPUB_EXTENSION } from "../src/lib/epub/filename";
import { epubPatchFromItem } from "../src/lib/epub/from-item";
import { convertEpubToKepub, KepubConversionError } from "../src/lib/epub/kepub";
import { EpubFormatError, readEpubMetadata, writeEpubMetadata } from "../src/lib/epub/metadata";
import { MAX_BOOK_FILE_BYTES } from "../src/lib/input-limits";
import { createAdminClient } from "../src/lib/supabase/admin";
import type { Json } from "../src/lib/database.types";

loadEnvConfig(process.cwd());

/** Every zip file starts with these four bytes. An EPUB is a zip file. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function stringArg(flag: string): string | null {
  const withEquals = args.find((entry) => entry.startsWith(`${flag}=`));
  if (withEquals) return withEquals.slice(flag.length + 1);
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

const manifestPath = stringArg("--manifest");
const baseDir = stringArg("--dir") ?? "books";
const positional = args.filter((entry) => !entry.startsWith("--"));

type Job = { itemId: string; path: string };

/** One failed item must not stop the batch, so the runner counts the outcomes. */
type Outcome = "attached" | "skipped" | "failed";

function usage(message: string): never {
  console.error(`${message}

  npm run book:attach -- <itemId> <path/to/book.epub>
  npm run book:attach -- --manifest books.tsv [--dir books] [--dry-run]`);
  process.exit(2);
}

async function readManifest(path: string): Promise<Job[]> {
  const text = await readFile(path, "utf8");
  const jobs: Job[] = [];

  for (const [index, line] of text.split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [itemId, file] = line.split("\t");
    if (!itemId || !file) {
      usage(`Line ${index + 1} of ${path} has no tab between the item id and the file name.`);
    }
    jobs.push({ itemId: itemId.trim(), path: resolve(baseDir, file.trim()) });
  }

  return jobs;
}

function hasZipMagic(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((byte, index) => bytes[index] === byte);
}

/** `structured` is jsonb, so it can hold an array or a scalar. */
function asRecord(value: Json): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function describe(error: unknown): string {
  if (error instanceof DriveError) return `drive ${error.code} (status ${error.status ?? "none"})`;
  if (error instanceof EpubFormatError) return `not a readable EPUB (${error.message})`;
  if (error instanceof KepubConversionError) return `conversion failed (${error.message})`;
  if (error instanceof Error) return error.message;
  return "unknown error";
}

/** Remove a file that no row points at. A leftover file must not fail the run. */
async function removeQuietly(driveId: string): Promise<void> {
  try {
    await deleteDriveFile(driveId);
  } catch (error) {
    console.warn(`    could not remove the previous Drive file: ${describe(error)}`);
  }
}

async function attach(job: Job): Promise<Outcome> {
  const supabase = createAdminClient();
  const label = basename(job.path);

  const { data: row, error: loadErr } = await supabase
    .from("items")
    .select("*")
    .eq("id", job.itemId)
    .maybeSingle();

  if (loadErr) {
    console.error(`✗ ${job.itemId}  could not read the item: ${loadErr.message}`);
    return "failed";
  }
  if (!row) {
    console.error(`✗ ${job.itemId}  no such item`);
    return "failed";
  }
  if (row.category !== "books") {
    // Only a book carries a file. The UI field gates on the same value.
    console.error(`✗ ${row.title ?? job.itemId}  category is ${row.category ?? "null"}, not books`);
    return "failed";
  }

  // The owner of the item decides the target, not the operator who runs this.
  const target = bookFileTarget(row.user_id);

  console.log(`• ${row.title ?? job.itemId}`);
  console.log(`    from ${label}, target ${target}`);

  // A kindle file must never fall back to the public Kobo folder.
  if (!dryRun && !isDriveConfigured(target)) {
    console.error(`    ✗ the Drive folder for the ${target} target is not configured`);
    return "failed";
  }

  let source: Uint8Array;
  try {
    source = new Uint8Array(await readFile(job.path));
  } catch (error) {
    console.error(`    ✗ could not read the file: ${describe(error)}`);
    return "failed";
  }

  if (source.byteLength > MAX_BOOK_FILE_BYTES) {
    console.error(`    ✗ the file holds ${source.byteLength} bytes, over the ${MAX_BOOK_FILE_BYTES} byte limit`);
    return "failed";
  }
  // A file name proves nothing. Test the bytes.
  if (!hasZipMagic(source)) {
    console.error("    ✗ the file is not a zip file, so it is not an EPUB");
    return "failed";
  }

  const patch = epubPatchFromItem({
    title: row.title,
    description: row.description,
    structured: asRecord(row.structured),
    genre_keys: row.genre_keys,
    mood_keys: row.mood_keys,
  });

  let bytes: Uint8Array;
  try {
    // Read the metadata first. The read confirms that the zip file is an EPUB.
    await readEpubMetadata(source);
    bytes = await writeEpubMetadata(source, patch);
  } catch (error) {
    console.error(`    ✗ ${describe(error)}`);
    return "failed";
  }

  // Convert to KEPUB. A Kobo shows a placeholder tile instead of the cover for
  // a plain EPUB. The kindle target skips this step. KOReader opens a plain EPUB.
  if (target === "kobo") {
    try {
      const converted = await convertEpubToKepub(bytes);
      bytes = converted.bytes;
      if (converted.skipped.length > 0) {
        // Name the documents that keep no Kobo spans. The book still opens.
        console.warn(`    partial conversion: ${converted.skipped.map((entry) => entry.path).join(", ")}`);
      }
    } catch (error) {
      console.error(`    ✗ ${describe(error)}`);
      return "failed";
    }
  }

  // Build the file name from the same item data as the metadata patch, so the
  // name and the metadata agree. A Kobo name must carry `.kepub.epub`, because
  // the device reads a `.epub` name as a plain EPUB whatever the file holds.
  const name = buildKoboFilename(
    {
      // Take the title from the patch, not the row. The patch drops a series
      // the title repeats, so the name and the EPUB metadata agree.
      title: patch.title ?? null,
      authors: patch.creators ?? null,
      series: patch.series ?? null,
      seriesIndex: patch.seriesIndex ?? null,
    },
    target === "kobo" ? KEPUB_EXTENSION : EPUB_EXTENSION,
  );

  // Hash the bytes that go to Drive, not the bytes that came off the disk.
  // The metadata rewrite and the conversion both change the file.
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  console.log(`    as ${name} (${bytes.byteLength} bytes)`);

  if (row.file_drive_id && row.file_sha256 === sha256) {
    console.log("    ✓ the row already holds this file");
    return "skipped";
  }

  if (dryRun) {
    console.log("    dry run, so nothing was uploaded or written");
    return "skipped";
  }

  let uploaded: { id: string; name: string };
  try {
    uploaded = await uploadEpub({ name, bytes, target });
  } catch (error) {
    console.error(`    ✗ upload failed: ${describe(error)}`);
    return "failed";
  }

  const previousDriveId = row.file_drive_id;

  // The constraint `items_file_columns_complete` accepts five values or five
  // nulls. Write all five columns in one statement.
  const { error: upErr } = await supabase
    .from("items")
    .update({
      file_drive_id: uploaded.id,
      file_name: uploaded.name,
      file_bytes: bytes.byteLength,
      file_sha256: sha256,
      file_uploaded_at: new Date().toISOString(),
    })
    .eq("id", job.itemId);

  if (upErr) {
    // No row points at the new file, so remove it.
    console.error(`    ✗ could not write the row: ${upErr.message}`);
    await removeQuietly(uploaded.id);
    return "failed";
  }

  // Order: upload, then update the row, then delete the previous file. A failed
  // upload keeps the previous file. A crash leaves a file that no row points
  // at. That file costs storage. A delete before the upload costs the book.
  if (previousDriveId && previousDriveId !== uploaded.id) await removeQuietly(previousDriveId);

  console.log("    ✓ attached");
  return "attached";
}

async function main(): Promise<void> {
  let jobs: Job[];

  if (manifestPath) {
    jobs = await readManifest(manifestPath);
  } else if (positional.length === 2) {
    jobs = [{ itemId: positional[0], path: resolve(positional[1]) }];
  } else {
    usage("Pass an item id and a file, or a manifest.");
  }

  if (jobs.length === 0) usage(`${manifestPath} holds no lines.`);

  // Drive holds every file, so a missing configuration fails every job. Say so
  // once, before the run spends time on the first book. Each job then tests the
  // folder of its own target.
  if (!dryRun && !isDriveConfigured("kobo") && !isDriveConfigured("kindle")) {
    console.error("Google Drive is not configured. Set the Drive variables, or pass --dry-run.");
    process.exit(1);
  }

  console.log(`${jobs.length} book(s)${dryRun ? ", dry run" : ""}\n`);

  const counts: Record<Outcome, number> = { attached: 0, skipped: 0, failed: 0 };
  for (const job of jobs) {
    counts[await attach(job)] += 1;
  }

  console.log(`\nattached ${counts.attached}, skipped ${counts.skipped}, failed ${counts.failed}`);
  if (counts.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { createHash } from "node:crypto";

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { bookFileTarget, canUseBookFile } from "@/lib/book-file-access";
import type { Json } from "@/lib/database.types";
import { deleteDriveFile, DriveError, isDriveConfigured, uploadEpub } from "@/lib/drive/client";
import { buildKoboFilename, EPUB_EXTENSION, KEPUB_EXTENSION } from "@/lib/epub/filename";
import { epubPatchFromItem } from "@/lib/epub/from-item";
import { convertEpubToKepub, KepubConversionError } from "@/lib/epub/kepub";
import { EpubFormatError, readEpubMetadata, writeEpubMetadata } from "@/lib/epub/metadata";
import { MAX_BOOK_FILE_BYTES } from "@/lib/input-limits";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/** Every zip file starts with these four bytes. An EPUB is a zip file. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/**
 * The multipart wrapper adds a boundary, a header block and a file name to the
 * body. The early size test allows for that. The exact test runs on the file.
 */
const MULTIPART_OVERHEAD_BYTES = 8 * 1024;

function fail(code: string, status: number): Response {
  return Response.json({ error: code }, { status });
}

/** Keep the Drive message and the Drive status in the log only. */
function reason(error: unknown): string {
  if (error instanceof DriveError) return `${error.code} (status ${error.status ?? "none"})`;
  if (error instanceof KepubConversionError) return error.message;
  if (error instanceof Error) return error.name;
  return "unknown error";
}

function hasZipMagic(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((byte, index) => bytes[index] === byte);
}

/** `structured` is jsonb, so it can hold an array or a scalar. */
function asRecord(value: Json): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** Remove a file that no row points at. A leftover file must not fail the request. */
async function removeQuietly(driveId: string): Promise<void> {
  try {
    await deleteDriveFile(driveId);
  } catch (error) {
    console.error("[api/items/:id/file] stale_delete_failed:", reason(error));
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return fail("unauthorized", 401);

  // Answer 404 for a user who is not on the allow-list, the same answer as for
  // a hidden row. The route does not tell other users that the feature exists.
  if (!canUseBookFile(user.id)) return fail("not_found", 404);

  const rl = await rateLimit(`book-file:${user.id}`, 20, 3600);
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 3600) } },
    );
  }

  // Test the configuration first. Without Drive the upload cannot finish, so the
  // route must not spend memory and time on the file. Each target needs its own
  // folder. A kindle upload never falls back to the public Kobo folder.
  const target = bookFileTarget(user.id);
  if (!isDriveConfigured(target)) return fail("drive_not_configured", 503);

  // Stop an oversized body before the route reads it into memory.
  const declaredBytes = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BOOK_FILE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return fail("file_too_large", 413);
  }

  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: row, error: loadErr } = await supabase.from("items").select("*").eq("id", id).maybeSingle();

  // RLS hides the rows of other users. Answer 404 for a hidden row too, because
  // 403 tells the caller that the item exists.
  if (loadErr || !row || row.user_id !== user.id) return fail("not_found", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("missing_file", 400);
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) return fail("missing_file", 400);
  if (file.size > MAX_BOOK_FILE_BYTES) return fail("file_too_large", 413);

  const source = new Uint8Array(await file.arrayBuffer());
  if (source.byteLength > MAX_BOOK_FILE_BYTES) return fail("file_too_large", 413);
  // A file name proves nothing. Test the bytes.
  if (!hasZipMagic(source)) return fail("invalid_epub", 422);

  const structured = asRecord(row.structured);
  const patch = epubPatchFromItem({
    title: row.title,
    description: row.description,
    structured,
    genre_keys: row.genre_keys,
    mood_keys: row.mood_keys,
  });

  let bytes: Uint8Array;
  try {
    // Read the metadata first. The read confirms that the zip file is an EPUB.
    await readEpubMetadata(source);
    bytes = await writeEpubMetadata(source, patch);
  } catch (error) {
    if (error instanceof EpubFormatError) return fail("invalid_epub", 422);
    throw error;
  }

  // Convert to KEPUB. A Kobo shows a placeholder tile instead of the cover for
  // a plain EPUB. The converter skips a document that already holds Kobo spans,
  // so a second upload of the same book never wraps the text twice.
  //
  // The route does not test the size again here. MAX_BOOK_FILE_BYTES states what
  // a person may upload, and the conversion adds about one percent. A rejection
  // after a file that met the stated limit would confuse the user.
  //
  // The kindle target skips this step. KOReader opens a plain EPUB.
  if (target === "kobo") {
    let converted: Awaited<ReturnType<typeof convertEpubToKepub>>;
    try {
      converted = await convertEpubToKepub(bytes);
    } catch (error) {
      if (error instanceof EpubFormatError || error instanceof KepubConversionError) {
        console.error("[api/items/:id/file] conversion_failed:", reason(error));
        return fail("conversion_failed", 422);
      }
      throw error;
    }
    bytes = converted.bytes;

    if (converted.skipped.length > 0) {
      // Name the documents that keep no Kobo spans. The book still opens.
      console.warn(
        "[api/items/:id/file] conversion_partial:",
        converted.skipped.map((entry) => `${entry.path} (${entry.reason})`).join(", "),
      );
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

  // Hash the bytes that go to Drive, not the bytes that came from the browser.
  // The metadata rewrite changes the file, so the digest must run after it.
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  let uploaded: { id: string; name: string };
  try {
    uploaded = await uploadEpub({ name, bytes, target });
  } catch (error) {
    console.error("[api/items/:id/file] upload_failed:", reason(error));
    return fail("upload_failed", 502);
  }

  const previousDriveId = row.file_drive_id;
  const uploadedAt = new Date().toISOString();

  // The constraint `items_file_columns_complete` accepts five values or five
  // nulls. Write all five columns in one statement.
  const { error: upErr } = await supabase
    .from("items")
    .update({
      file_drive_id: uploaded.id,
      file_name: uploaded.name,
      file_bytes: bytes.byteLength,
      file_sha256: sha256,
      file_uploaded_at: uploadedAt,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (upErr) {
    console.error("[api/items/:id/file] row_update_failed:", upErr.message);
    // The row still points at the previous file. No row points at the new file,
    // so remove it.
    await removeQuietly(uploaded.id);
    return fail("upload_failed", 502);
  }

  // Order: upload, then update the row, then delete the previous file. A failed
  // upload then keeps the previous file. A crash leaves a file that no row
  // points at. That file costs storage. A delete before the upload costs the
  // book.
  if (previousDriveId && previousDriveId !== uploaded.id) await removeQuietly(previousDriveId);

  return Response.json({
    file: { name: uploaded.name, bytes: bytes.byteLength, uploaded_at: uploadedAt },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return fail("unauthorized", 401);
  if (!canUseBookFile(user.id)) return fail("not_found", 404);

  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: row, error: loadErr } = await supabase.from("items").select("*").eq("id", id).maybeSingle();

  if (loadErr || !row || row.user_id !== user.id) return fail("not_found", 404);

  // The goal state is that the item has no file. A row without a file already
  // has that state.
  if (!row.file_drive_id) return Response.json({ file: null });

  if (!isDriveConfigured()) return fail("drive_not_configured", 503);

  try {
    await deleteDriveFile(row.file_drive_id);
  } catch (error) {
    console.error("[api/items/:id/file] delete_failed:", reason(error));
    // Keep the columns. Drive still holds the file, and the reader still shows
    // the book. Cleared columns lose the file id, so nobody can remove the file
    // later. The user can send the request again.
    return fail("delete_failed", 502);
  }

  // Drive no longer holds the file. Clear all five columns in one statement.
  const { error: upErr } = await supabase
    .from("items")
    .update({
      file_drive_id: null,
      file_name: null,
      file_bytes: null,
      file_sha256: null,
      file_uploaded_at: null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (upErr) {
    console.error("[api/items/:id/file] row_clear_failed:", upErr.message);
    // A second request repeats the work. Drive answers 404 for the file, which
    // counts as success, and the update runs again.
    return fail("delete_failed", 502);
  }

  return Response.json({ file: null });
}

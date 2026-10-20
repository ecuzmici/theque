import { DriveError, downloadDriveFile } from "@/lib/drive/client";
import { epubPatchFromItem } from "@/lib/epub/from-item";
import { writeEpubMetadata } from "@/lib/epub/metadata";
import { byteStream, contentDisposition, EPUB_TYPE, isKepubFileName } from "@/lib/opds/feed";
import { authenticateOpds, OPDS_CACHE_CONTROL, opdsText } from "@/lib/opds/server";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Each download reads a whole book from Drive, so the limit is lower than for feeds. */
const FILE_LIMIT = 60;
const FILE_WINDOW_SEC = 3600;

function reason(error: unknown): string {
  if (error instanceof DriveError) return `${error.code} (status ${error.status ?? "none"})`;
  if (error instanceof Error) return error.message;
  return "unknown error";
}

/** `structured` is jsonb, so it can hold an array or a scalar. */
function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** Download one book file through the OPDS catalog. See docs/kindle-opds.md. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateOpds(req);
  if (auth instanceof Response) return auth;

  const rl = await rateLimit(`opds-file:${auth.userId}`, FILE_LIMIT, FILE_WINDOW_SEC);
  if (!rl.ok) return opdsText("Too many requests", 429, { "Retry-After": String(rl.retryAfter ?? 60) });

  const { id } = await ctx.params;
  if (!UUID.test(id)) return opdsText("Not found", 404);

  // The service role skips RLS. The user filter keeps the row private.
  const { data: row, error } = await createAdminClient()
    .from("items")
    .select("id, title, description, structured, genre_keys, mood_keys, file_drive_id, file_name")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .eq("category", "books")
    .maybeSingle();

  if (error) console.error("[opds/file] row_load_failed:", error.message);
  if (!row?.file_drive_id) return opdsText("Not found", 404);

  let bytes: Uint8Array;
  try {
    bytes = await downloadDriveFile(row.file_drive_id);
  } catch (error) {
    console.error("[opds/file] download_failed:", reason(error));
    if (error instanceof DriveError && error.code === "drive_not_configured") {
      return opdsText("Drive is not configured", 503);
    }
    return opdsText("Download failed", 502);
  }

  // Write the current item data into the file, so the tags are fresh even for
  // a file from before the tagging. A KEPUB belongs to a Kobo user. Serve it as
  // stored. A failed patch must not cost the book, so send the stored bytes.
  if (!isKepubFileName(row.file_name)) {
    try {
      bytes = await writeEpubMetadata(
        bytes,
        epubPatchFromItem({
          title: row.title,
          description: row.description,
          structured: asRecord(row.structured),
          genre_keys: row.genre_keys,
          mood_keys: row.mood_keys,
        }),
      );
    } catch (error) {
      console.error("[opds/file] patch_failed:", reason(error));
    }
  }

  return new Response(byteStream(bytes), {
    headers: {
      "Content-Type": EPUB_TYPE,
      "Content-Disposition": contentDisposition(row.file_name),
      "Cache-Control": OPDS_CACHE_CONTROL,
    },
  });
}

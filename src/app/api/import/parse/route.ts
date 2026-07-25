/**
 * POST /api/import/parse — server-side parse for file formats the browser cannot read.
 *
 * Import parsing is *mostly* isomorphic: the CSV engine is papaparse, so the
 * settings page parses CSV/TSV/plain-URL files in the browser and never uploads
 * them. The bookmark-shaped parsers are not — `netscape-bookmarks` and
 * `pocket-html` parse tag soup with **jsdom**, a Node-only package, and archive
 * formats need raw bytes. Those files come here instead.
 *
 * This route only reads: it hands back an `ImportParseResult` for the preview
 * step. Nothing is written until the user confirms and the rows go to
 * `POST /api/import`.
 */

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { detectImporter } from "@/lib/import";
import { rateLimit } from "@/lib/rate-limit";
import type { ImportParseResponseBody } from "@/lib/types/api";

/**
 * Upload ceiling. Vercel caps a serverless request body at 4.5 MB, so refuse
 * above 4 MB with a message the user can act on rather than letting the
 * platform return an opaque 413. Real exports are far smaller: a 5000-item
 * Pocket HTML export is around 1 MB.
 */
export const MAX_IMPORT_FILE_BYTES = 4 * 1024 * 1024;

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

export async function POST(req: Request) {
  const user = await getSessionUserOrNull();
  if (!user) {
    return jsonResponse({ code: "unauthorized" }, { status: 401 });
  }

  // Parsing is CPU-bound (jsdom on a megabyte of tag soup); its own bucket keeps
  // that separate from the insert route's per-chunk budget.
  const rl = await rateLimit(`import-parse:${user.id}`, 10, 60);
  if (!rl.ok) {
    return jsonResponse(
      { code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ code: "invalid_body" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonResponse({ code: "missing_file" }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return jsonResponse(
      { code: "file_too_large", max_bytes: MAX_IMPORT_FILE_BYTES },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Container formats read `bytes`; text formats read `text`. Decoding an
  // archive as UTF-8 yields garbage, which is harmless — its detector looks at
  // the bytes.
  const text = new TextDecoder("utf-8").decode(bytes);
  const input = { text, filename: file.name, bytes };

  const importer = detectImporter(input);
  if (!importer) {
    return jsonResponse({ code: "unrecognized_file" }, { status: 422 });
  }

  let result: Awaited<ReturnType<typeof importer.parse>>;
  try {
    result = await importer.parse(input);
  } catch (err) {
    console.error(
      "[api/import/parse] parse_failed:",
      err instanceof Error ? err.message : "unknown_error",
    );
    return jsonResponse({ code: "parse_failed" }, { status: 422 });
  }

  const body: ImportParseResponseBody = {
    importer: { id: importer.id, label: importer.label },
    rows: result.rows,
    skipped: result.skipped,
    warnings: result.warnings,
  };
  return jsonResponse(body);
}

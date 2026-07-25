/**
 * POST /api/import — batched ingest for bulk file imports.
 *
 * ## Why this is not a loop over `/api/capture`
 *
 * `/api/capture` is rate-limited to 60 requests / 60s per user and enriches
 * inline via `after()`. A 400-row Pocket export through that path would take
 * seven minutes and spend most of it being 429'd. This route takes an
 * already-parsed batch (the browser does the parsing — see `src/lib/import/`)
 * and inserts it in one round trip per chunk.
 *
 * ## Dedup is the schema's job
 *
 * `items` carries `unique (user_id, url_fingerprint)`, so the insert is an
 * upsert with on-conflict-**do-nothing**. Re-importing the same file is a no-op
 * by construction rather than by a pre-flight `select` that races itself, and
 * the difference between rows sent and rows returned *is* the duplicate count.
 *
 * ## "Trust the file, drain later"
 *
 * Rows land with whatever the export gave us (title, rating, verdict, done_at)
 * and `processing_status = 'pending'`, so they read as real cards immediately
 * and `claim_pending_enrichment_items` can still pick them up for covers and
 * structured fields. Enrichment is deliberately *not* kicked off here: firing
 * hundreds of `after()` fetches would blow the function budget and hammer the
 * source sites.
 */

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { encryptField } from "@/lib/crypto/field-crypto";
import type { Database, ItemCategory, ItemStatus, Json } from "@/lib/database.types";
import {
  DEFAULT_IMPORT_STATUS,
  isItemCategory,
  isItemStatus,
  IMPORT_SKIP_REASONS,
} from "@/lib/import/types";
import {
  hasMaxLength,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
} from "@/lib/input-limits";
import { checkQuota, MAX_ITEMS_PER_USER } from "@/lib/quotas";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type {
  ImportRejection,
  ImportRequestBody,
  ImportResponseBody,
} from "@/lib/types/api";
import { domainFromCanonicalUrl } from "@/lib/url/domain";
import { fingerprint } from "@/lib/url/fingerprint";
import { normalizeUrl } from "@/lib/url/normalize";

type ItemInsert = Database["public"]["Tables"]["items"]["Insert"];

/**
 * Rows accepted per request.
 *
 * The file-level cap is `IMPORT_MAX_ROWS` (5000) in the parser; this is the
 * *transport* cap. A 5000-row file arrives as ~20 requests of 250, which keeps
 * every JSON payload well under the serverless body limit, gives the UI a
 * natural progress tick, and means a single failed chunk costs 250 rows rather
 * than the whole import. The two caps are independent on purpose: the parser
 * bounds memory, this bounds one HTTP request.
 */
export const MAX_IMPORT_ROWS_PER_REQUEST = 500;

/** Rows per `upsert` statement. Keeps one PostgREST payload comfortably small. */
const INSERT_CHUNK_SIZE = 100;

/** Own bucket: ~20 chunks per file, with headroom for a retry or a second file. */
const IMPORT_RATE_LIMIT = 40;
const IMPORT_RATE_WINDOW_SEC = 60;

const REJECT_REASONS = {
  ...IMPORT_SKIP_REASONS,
  /** The library is full; the rest of the file did not fit under the quota. */
  quotaExceeded: "quota_exceeded",
  /** The chunk's insert failed. Re-running the import retries these rows. */
  insertFailed: "insert_failed",
} as const;

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

/**
 * Only non-empty strings become ciphertext — mirrors `decryptField`'s
 * passthrough for `null`/`""` (never store `enc.` of an empty string, ADR 0013).
 */
function encryptIfPresent(value: string | null): string | null {
  if (!value) return value ?? null;
  return encryptField(value);
}

function readString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** `rating_personal` is a 1..5 smallint with a CHECK constraint; anything else is dropped. */
function readRating(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 1 && rounded <= 5 ? rounded : null;
}

function readIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * `alter type item_source add value 'import'` not applied yet.
 *
 * The route must not 500 in that state — the operator needs to be told what to
 * run, and the user needs to know nothing was lost.
 */
function isMissingImportEnumValue(message: string | undefined): boolean {
  if (!message) return false;
  return /invalid input value for enum item_source/i.test(message);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  const user = await getSessionUserOrNull();
  if (!user) {
    return jsonResponse({ code: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`import:${user.id}`, IMPORT_RATE_LIMIT, IMPORT_RATE_WINDOW_SEC);
  if (!rl.ok) {
    return jsonResponse(
      { code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? IMPORT_RATE_WINDOW_SEC) } },
    );
  }

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return jsonResponse({ code: "invalid_body" }, { status: 400 });
  }

  const body = bodyUnknown as ImportRequestBody;
  if (!body || !Array.isArray(body.rows)) {
    return jsonResponse({ code: "invalid_body" }, { status: 400 });
  }
  if (body.rows.length > MAX_IMPORT_ROWS_PER_REQUEST) {
    return jsonResponse(
      { code: "batch_too_large", max_rows: MAX_IMPORT_ROWS_PER_REQUEST },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const quota = await checkQuota(supabase, user.id, "items", MAX_ITEMS_PER_USER);
  if (!quota.ok) {
    return jsonResponse(
      {
        code: "quota_exceeded",
        message: `Your library is at the ${MAX_ITEMS_PER_USER.toLocaleString("en-US")}-item limit. Remove some items before importing more.`,
      },
      { status: 409 },
    );
  }

  // Headroom, so a file that only *partly* fits imports what it can and says so,
  // instead of failing opaquely on the chunk that crosses the line. `checkQuota`
  // answers "may they write at all"; this answers "how many more".
  const { count, error: countError } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const headroom = countError
    ? body.rows.length // Fail open, exactly like `checkQuota` does on a count error.
    : Math.max(MAX_ITEMS_PER_USER - (count ?? 0), 0);

  const rejected: ImportRejection[] = [];
  const inserts: ItemInsert[] = [];
  const seenFingerprints = new Set<string>();
  let duplicates = 0;

  for (const raw of body.rows) {
    const row = (raw ?? {}) as Record<string, unknown>;
    // `ImportRow.source_ref` carries the file/line provenance the parser kept so
    // a rejected row can be pointed at in the user's own file.
    const sourceRef = (row.source_ref ?? {}) as Record<string, unknown>;
    const line = typeof sourceRef.line === "number" ? sourceRef.line : undefined;
    const rawUrl = typeof row.url === "string" ? row.url.trim() : "";

    if (!rawUrl) {
      rejected.push({ line, reason: REJECT_REASONS.missingUrl });
      continue;
    }
    if (!hasMaxLength(rawUrl, MAX_URL_LENGTH)) {
      rejected.push({ line, reason: REJECT_REASONS.urlTooLong, raw: rawUrl.slice(0, 200) });
      continue;
    }

    let canonical: string;
    try {
      canonical = normalizeUrl(rawUrl);
    } catch {
      rejected.push({ line, reason: REJECT_REASONS.invalidUrl, raw: rawUrl.slice(0, 200) });
      continue;
    }

    const fp = fingerprint(canonical);
    // Duplicates *inside* one batch would otherwise hit the same conflict target
    // twice in a single statement; count them here and send each URL once.
    if (seenFingerprints.has(fp)) {
      duplicates += 1;
      continue;
    }
    seenFingerprints.add(fp);

    if (inserts.length >= headroom) {
      rejected.push({ line, reason: REJECT_REASONS.quotaExceeded, raw: rawUrl.slice(0, 200) });
      continue;
    }

    const status: ItemStatus = isItemStatus(row.status) ? row.status : DEFAULT_IMPORT_STATUS;
    const category: ItemCategory | null = isItemCategory(row.category) ? row.category : null;
    const doneAt = readIsoDate(row.done_at);
    const savedAtHint = readIsoDate(row.created_at_hint);

    inserts.push({
      user_id: user.id,
      url: rawUrl,
      canonical_url: canonical,
      url_fingerprint: fp,
      domain: domainFromCanonicalUrl(canonical),
      source: "import",
      title: readString(row.title, MAX_TITLE_LENGTH),
      subtitle: readString(row.subtitle, MAX_TITLE_LENGTH),
      description: readString(row.description, MAX_NOTE_LENGTH),
      image_url: readString(row.image_url, MAX_URL_LENGTH),
      // Left with no `category_source`: the file's category is a starting point
      // for shelf placement, and enrichment's classifier refines it later.
      category,
      status,
      rating_personal: readRating(row.rating_personal),
      verdict: encryptIfPresent(readString(row.verdict, MAX_NOTE_LENGTH)),
      // A file can say "read" without saying when. The status is still the truth;
      // date it from the save hint, else now, so the taste loop has a timestamp.
      done_at: status === "done" ? (doneAt ?? savedAtHint ?? new Date().toISOString()) : doneAt,
      // Stays claimable by `claim_pending_enrichment_items` — see the file header.
      processing_status: "pending",
      // Provenance for "where did this row come from?". Enrichment overwrites
      // `raw_metadata` when it runs, so this is deliberately small.
      raw_metadata: {
        import: {
          importer:
            readString(sourceRef.importer, 100) ??
            (typeof body.importer === "string" ? body.importer : null),
          file: readString(sourceRef.file, 300),
          external_id: readString(sourceRef.external_id, 200),
          ...(line !== undefined ? { line } : {}),
          ...(savedAtHint ? { saved_at_hint: savedAtHint } : {}),
        },
      } as Json,
    });
  }

  let inserted = 0;
  let failed = 0;

  for (const batch of chunk(inserts, INSERT_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("items")
      .upsert(batch, { onConflict: "user_id,url_fingerprint", ignoreDuplicates: true })
      .select("id");

    if (error) {
      if (isMissingImportEnumValue(error.message)) {
        // Every chunk would fail the same way; stop and say why.
        console.error("[api/import] missing_item_source_enum:", error.message);
        return jsonResponse(
          {
            code: "import_source_unavailable",
            message:
              "Import is not enabled on this database yet: the 'import' item_source value is missing. Apply supabase/migrations/20260725160000_item_source_import.sql.",
          },
          { status: 503 },
        );
      }
      // One bad chunk must not lose the rest of the import.
      console.error("[api/import] chunk_insert_failed:", error.message);
      failed += batch.length;
      rejected.push({ reason: REJECT_REASONS.insertFailed, raw: `${batch.length} rows` });
      continue;
    }

    inserted += data?.length ?? 0;
  }

  // On-conflict-do-nothing returns only the rows it actually wrote, so whatever
  // was sent and did not come back was already in the library.
  duplicates += Math.max(inserts.length - inserted - failed, 0);

  const responseBody: ImportResponseBody = {
    inserted,
    duplicates,
    failed,
    rejected,
    remaining_quota: Math.max(headroom - inserted, 0),
  };

  return jsonResponse(responseBody);
}

import type { Database } from "@/lib/database.types";

import type { ItemSummaryPayload } from "@/lib/types/api";

export type LibraryItemRow = Pick<
  Database["public"]["Tables"]["items"]["Row"],
  | "id"
  | "title"
  | "subtitle"
  | "image_url"
  | "image_storage_path"
  | "domain"
  | "category"
  | "status"
  | "processing_status"
  | "created_at"
  | "display"
  | "canonical_url"
  | "dominant_color"
  | "dominant_hue"
  | "rating_personal"
  | "verdict"
  | "done_at"
  | "file_uploaded_at"
>;

export function libraryItemFromSummary(summary: ItemSummaryPayload): LibraryItemRow {
  return {
    id: summary.id,
    title: summary.title,
    subtitle: summary.subtitle,
    image_url: summary.image_url,
    image_storage_path: summary.image_storage_path,
    domain: summary.domain,
    category: summary.category,
    status: summary.status,
    processing_status: summary.processing_status,
    created_at: summary.created_at,
    display: summary.display,
    canonical_url: summary.canonical_url,
    dominant_color: summary.dominant_color,
    dominant_hue: summary.dominant_hue,
    rating_personal: summary.rating_personal ?? null,
    verdict: summary.verdict ?? null,
    done_at: summary.done_at ?? null,
    file_uploaded_at: summary.file_uploaded_at ?? null,
  };
}

/**
 * Narrows a full (already-decrypted) `items` row — e.g. the response of the
 * decrypting `GET /api/items/[id]` — down to the `LibraryItemRow` fields the
 * library grid renders. Used to merge fresh content into a displayed card
 * (see `useItemRealtime`) without ever taking `note`/`verdict` from a
 * realtime payload, which is ciphertext on the wire (ADR 0013).
 */
export function libraryItemFromRow(
  row: Database["public"]["Tables"]["items"]["Row"],
): LibraryItemRow {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    image_url: row.image_url,
    image_storage_path: row.image_storage_path,
    domain: row.domain,
    category: row.category,
    status: row.status,
    processing_status: row.processing_status,
    created_at: row.created_at,
    display: row.display,
    canonical_url: row.canonical_url,
    dominant_color: row.dominant_color,
    dominant_hue: row.dominant_hue,
    rating_personal: row.rating_personal,
    verdict: row.verdict,
    done_at: row.done_at,
    file_uploaded_at: row.file_uploaded_at,
  };
}

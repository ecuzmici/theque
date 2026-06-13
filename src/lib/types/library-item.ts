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
  };
}

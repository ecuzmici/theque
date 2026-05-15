import type {
  ItemCategory,
  ItemSource,
  ItemStatus,
  ProcessingStatus,
} from "@/lib/database.types";

/** POST /api/capture */
export type CaptureRequestBody = {
  url: string;
  note?: string | null;
  tag_names?: string[];
  collection_ids?: string[];
  source: ItemSource;
};

export type CaptureItemPayload = {
  id: string;
  url: string;
  canonical_url: string;
  domain: string;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  category: ItemCategory | null;
  category_confidence: number | null;
  status: ItemStatus;
  processing_status: ProcessingStatus;
  source: ItemSource;
  note: string | null;
  created_at: string;
};

export type CaptureResponseBody = {
  created: boolean;
  item: CaptureItemPayload;
};

/** GET /api/items */
export type ItemSummaryPayload = {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  domain: string;
  category: ItemCategory | null;
  status: ItemStatus;
  processing_status: ProcessingStatus;
  canonical_url: string;
  created_at: string;
  tags: string[];
  collection_ids: string[];
};

export type ItemsListResponseBody = {
  items: ItemSummaryPayload[];
  next_cursor: string | null;
};

/** POST /api/items/:id/retry-enrichment */
export type RetryEnrichmentResponseBody = {
  item_id: string;
  processing_status: ProcessingStatus;
};

/** POST /api/jobs/enrich */
export type EnrichJobResponseBody = {
  processed: number;
  failed: number;
};

/** POST /api/capture-tokens */
export type CaptureTokenCreateResponseBody = {
  id: string;
  name: string;
  token: string;
  token_prefix: string;
  created_at: string;
};

/** GET /api/collections */
export type CollectionListEntry = {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
};

export type CollectionsListResponseBody = {
  collections: CollectionListEntry[];
};

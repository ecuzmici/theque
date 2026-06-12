import type { ExtensionCategoryHint } from "@/lib/capture/category-hint";
import type {
  Database,
  ItemCategory,
  ItemSource,
  ItemStatus,
  Json,
  ProcessingStatus,
} from "@/lib/database.types";

/** POST /api/capture */
export type CaptureRequestBody = {
  url: string;
  note?: string | null;
  category_hint?: ExtensionCategoryHint | null;
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
  image_storage_path: string | null;
  domain: string;
  category: ItemCategory | null;
  status: ItemStatus;
  processing_status: ProcessingStatus;
  canonical_url: string;
  created_at: string;
  tags: string[];
  collection_ids: string[];
  display: Json | null;
  dominant_color: string | null;
  dominant_hue: number | null;
};

export type ItemsListResponseBody = {
  items: ItemSummaryPayload[];
  next_cursor: string | null;
};

/** GET /api/items/:id and PATCH /api/items/:id */
export type ItemDetailResponseBody = Database["public"]["Tables"]["items"]["Row"] & {
  tags: string[];
  collection_ids: string[];
};

/** POST /api/items/:id/retry-enrichment */
export type RetryEnrichmentResponseBody = {
  item_id: string;
  processing_status: ProcessingStatus;
};

/** POST /api/items/:id/ai-enrichment-proposal */
export type AiItemRewriteProposal = {
  category: ItemCategory;
  category_confidence: number;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  structured: Record<string, Json>;
  confidence: number;
  sources: string[];
  notes?: string | null;
};

export type AiEnrichmentProposalMetadata = {
  provider: string;
  model?: string;
};

export type AiEnrichmentProposalResponseBody = {
  item_id: string;
  proposal: AiItemRewriteProposal;
  proposal_metadata: AiEnrichmentProposalMetadata;
};

/** POST /api/items/:id/ai-enrichment-apply */
export type AiEnrichmentApplyRequestBody = {
  proposal: AiItemRewriteProposal;
  proposal_metadata: AiEnrichmentProposalMetadata;
};

export type AiEnrichmentApplyResponseBody = ItemDetailResponseBody;

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

/** GET /api/capture-tokens */
export type CaptureTokenListEntry = {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type CaptureTokensListResponseBody = {
  tokens: CaptureTokenListEntry[];
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

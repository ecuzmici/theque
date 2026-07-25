import type { ExtensionCategoryHint } from "@/lib/capture/category-hint";
import type { ImportRow, ImportSkip } from "@/lib/import/types";
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
  /** Rendered-DOM evidence from the Chrome extension; validated server-side
   * by parseCaptureSnapshot. Malformed/oversized values are dropped silently. */
  capture_snapshot?: unknown;
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
  display: Json | null;
  dominant_color: string | null;
  dominant_hue: number | null;
  rating_personal: number | null;
  verdict: string | null;
  done_at: string | null;
};

export type ItemsListResponseBody = {
  items: ItemSummaryPayload[];
  next_cursor: string | null;
};

/** GET /api/items/:id and PATCH /api/items/:id */
export type ItemDetailResponseBody = Database["public"]["Tables"]["items"]["Row"];

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

/**
 * POST /api/import — one chunk of an already-parsed import file.
 *
 * Parsing happens in the browser (see `src/lib/import/`), so the wire format is
 * `ImportRow`-shaped, not the file itself. The client posts several chunks per
 * file; each is independent, which is what makes progress reporting and
 * partial-failure recovery possible.
 */
export type ImportRequestBody = {
  rows: unknown[];
  /** Importer id (`"pocket-csv"`, `"csv-custom"`, …), recorded for support. */
  importer?: string | null;
};

/** POST /api/import/parse — server-side parse for jsdom/byte-bound formats. */
export type ImportParseResponseBody = {
  importer: { id: string; label: string };
  rows: ImportRow[];
  skipped: ImportSkip[];
  warnings: string[];
};

/** A row the server refused, with a reason the UI shows verbatim. */
export type ImportRejection = {
  /** 1-based record number in the source file, when the parser knew it. */
  line?: number;
  reason: string;
  /** Truncated source text so the user can recognise the row. */
  raw?: string;
};

export type ImportResponseBody = {
  /** Rows that became new items. */
  inserted: number;
  /** Rows already in the library (same `url_fingerprint`) — the idempotency count. */
  duplicates: number;
  /** Rows lost to a failed insert chunk; retryable by re-running the import. */
  failed: number;
  rejected: ImportRejection[];
  /** Item headroom left under `MAX_ITEMS_PER_USER` after this chunk. */
  remaining_quota: number;
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

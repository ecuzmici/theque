import type {
  CategorySource,
  ItemCategory,
  ItemSource,
  ItemStatus,
  ProcessingStatus,
} from "@/lib/database.types";

export const STATUS_LABELS: Record<ItemStatus, string> = {
  inbox: "Inbox",
  want: "Want",
  done: "Done",
  dismissed: "Dismissed",
};

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  books: "Books",
  movies_and_tv: "Movies & TV",
  restaurants: "Restaurants",
  products: "Products",
  travel: "Travel",
  recipes: "Recipes",
  articles: "Articles",
};

export const CATEGORY_SOURCE_LABELS: Record<CategorySource, string> = {
  domain: "Domain",
  schema_org: "Schema.org",
  heuristic: "Heuristic",
  manual: "Manual",
  llm: "AI",
};

export const ITEM_SOURCE_LABELS: Record<ItemSource, string> = {
  chrome_extension: "Chrome extension",
  ios_shortcut: "iOS shortcut",
  manual: "Manual",
  mobile_share_extension: "Mobile share extension",
};

export const PROCESSING_STATUS_LABELS: Record<ProcessingStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

function humanizeEnumToken(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatStatus(status: ItemStatus): string {
  return STATUS_LABELS[status] ?? humanizeEnumToken(status);
}

export function formatCategory(category: ItemCategory | null): string {
  if (!category) return "Uncategorized";
  return CATEGORY_LABELS[category] ?? humanizeEnumToken(category);
}

export function formatCategorySource(source: CategorySource | null): string {
  if (!source) return "Unknown";
  return CATEGORY_SOURCE_LABELS[source] ?? humanizeEnumToken(source);
}

export function formatItemSource(source: ItemSource | null): string {
  if (!source) return "Unknown";
  return ITEM_SOURCE_LABELS[source] ?? humanizeEnumToken(source);
}

export function formatProcessingStatus(status: ProcessingStatus): string {
  return PROCESSING_STATUS_LABELS[status] ?? humanizeEnumToken(status);
}

export function formatItemMetadataValue(key: string, value: string): string {
  switch (key) {
    case "category":
      return formatCategory(value as ItemCategory);
    case "status":
      return formatStatus(value as ItemStatus);
    case "category_source":
      return formatCategorySource(value as CategorySource);
    case "source":
      return formatItemSource(value as ItemSource);
    case "processing_status":
      return formatProcessingStatus(value as ProcessingStatus);
    default:
      return value;
  }
}

/** Category-aware completion verb: "Mark as read", "Mark as watched", … */
export const DONE_VERBS: Record<ItemCategory, string> = {
  books: "read",
  movies_and_tv: "watched",
  restaurants: "visited",
  products: "bought",
  travel: "visited",
  recipes: "cooked",
  articles: "read",
};

export function doneVerb(category: ItemCategory | null): string {
  return category ? (DONE_VERBS[category] ?? "done") : "done";
}

const ENRICHMENT_ERROR_MESSAGES: Record<string, string> = {
  fetch_blocked_or_sparse: "This site blocked our preview. Edit the details or try Enrich with AI.",
};

const ENRICHMENT_ERROR_FALLBACK = "We could not fetch details for this page.";

/** Maps a stored `enrichment_error` code to text. A raw error never reaches the page. */
export function formatEnrichmentError(code: string): string {
  return ENRICHMENT_ERROR_MESSAGES[code] ?? ENRICHMENT_ERROR_FALLBACK;
}

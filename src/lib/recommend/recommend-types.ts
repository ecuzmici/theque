/** Shelf IDs that support AI recommendations (F1 books, F2 watch). */
export type RecommendShelfId = "books" | "watch";

/** One item from the user's library passed to the LLM for context. */
export type RecommendInputItem = {
  title: string;
  creator: string | null;
  year: number | null;
};

/** One item in a verdict-driven taste profile bucket. */
export type TasteProfileItem = {
  title: string;
  creator: string | null;
  year: number | null;
  verdictNote?: string | null;
};

/** Taste profile assembled server-side for the LLM prompt. */
export type TasteProfile = {
  loved: TasteProfileItem[];
  disliked: TasteProfileItem[];
  backlog: TasteProfileItem[];
  never: string[];
};

/** Raw candidate emitted by the LLM (identity only, no URLs). */
export type LlmCandidate = {
  title: string;
  creator: string;
  year?: number | null;
  description: string;
  reason: string;
};

/** A fully resolved recommendation card ready to show to the user. */
export type ResolvedRecommendation = {
  id: string;
  outcome_id: string;
  title: string;
  subtitle: string;
  description: string;
  reason: string;
  canonical_url: string;
  cover_url: string | null;
  search_query: string;
  source: "open_library" | "tmdb";
  /** Source rating (e.g. Open Library / TMDB), 0–10 scale normalized to 0–5 for display. */
  source_rating?: number | null;
  /** Human-readable rating count (e.g. "1.1M"). */
  rating_count?: string | null;
  /** Human-readable length (e.g. "245 pages", "Film"). */
  length?: string | null;
  genres?: string[];
};

/** POST /api/recommend request body. */
export type RecommendRequest = {
  shelfId: RecommendShelfId;
};

/** POST /api/recommend success response. */
export type RecommendResponse = {
  cards: ResolvedRecommendation[];
};

/** Final outcome actions the deck can log (not `shown`). */
export type RecommendOutcomeAction = "saved" | "dismissed";

export type RecommendDismissReason =
  | "not_my_thing"
  | "already_seen"
  | "not_right_now";

/** POST /api/recommend/outcomes request body. */
export type RecommendOutcomeRequest = {
  outcomeId: string;
  outcome: RecommendOutcomeAction;
  dismissReason?: RecommendDismissReason;
};

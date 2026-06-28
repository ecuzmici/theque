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
};

/** POST /api/recommend request body. */
export type RecommendRequest = {
  shelfId: RecommendShelfId;
};

/** POST /api/recommend success response. */
export type RecommendResponse = {
  cards: ResolvedRecommendation[];
};

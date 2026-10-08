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
  /**
   * Every titled library item, echoed to the LLM as an explicit "already have —
   * do not suggest" list so it stops proposing owned titles the dedup pass would
   * silently drop (ADR 0016). Capped at RECOMMEND_MAX_OWNED_TITLES. Optional so
   * unit fixtures that only exercise the taste sections can omit it.
   */
  owned?: string[];
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
  source: "hardcover" | "open_library" | "tmdb";
  /** Source rating (e.g. Open Library / TMDB), 0–10 scale normalized to 0–5 for display. */
  source_rating?: number | null;
  /** Human-readable rating count (e.g. "1.1M"). */
  rating_count?: string | null;
  /** Human-readable length (e.g. "245 pages", "1h 58m", "TV · 2 seasons"). */
  length?: string | null;
  genres?: string[];
  /** YouTube trailer link (watch shelf only). */
  trailer_url?: string | null;
  /** Streaming provider names for the viewer's region (watch shelf only,
   * JustWatch-sourced via TMDB — the deck footer carries attribution). */
  providers?: string[];
  /** TMDB watch page for the region, for a "where to watch" link. */
  providers_link?: string | null;
  /** The book's opening line (books shelf only). */
  opening_line?: string | null;
};

/** POST /api/recommend request body. */
export type RecommendRequest = {
  shelfId: RecommendShelfId;
};

/**
 * Why a recommendation run came back empty (ADR 0016), so the UI can tell an
 * honest dead-end from a retryable miss:
 * - `exhausted`: the LLM generated fine but everything it produced is already
 *   owned or recently seen — the user is near the edge of their taste graph.
 * - `transient`: the LLM under-produced or nothing resolved — retrying may help.
 */
export type RecommendEmptyReason = "exhausted" | "transient";

/** POST /api/recommend success response. */
export type RecommendResponse = {
  cards: ResolvedRecommendation[];
  /** Present only when `cards` is empty; tells the deck which copy to show. */
  reason?: RecommendEmptyReason;
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

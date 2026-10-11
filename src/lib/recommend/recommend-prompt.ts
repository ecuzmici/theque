/**
 * Prompt builder for the AI recommendation LLM layer (Workstream F).
 *
 * The LLM returns identity-only candidates (title, creator, year, description, reason).
 * It NEVER emits URLs — grounding is handled deterministically by the resolver layer.
 */

import type {
  LlmCandidate,
  RecommendShelfId,
  TasteProfile,
  TasteProfileItem,
} from "@/lib/recommend/recommend-types";
import { RECOMMEND_OVER_REQUEST } from "@/lib/recommend/recommend-config";

const SHELF_LABELS: Record<RecommendShelfId, string> = {
  books: "books",
  watch: "movies and TV shows",
};

const CREATOR_LABELS: Record<RecommendShelfId, string> = {
  books: "author",
  watch: "director",
};

function formatProfileItem(item: TasteProfileItem, includeVerdict: boolean): string {
  const parts: string[] = [`"${item.title}"`];
  if (item.creator) parts.push(`by ${item.creator}`);
  if (item.year) parts.push(`(${item.year})`);
  let line = `- ${parts.join(" ")}`;
  if (includeVerdict && item.verdictNote) {
    line += ` — "${item.verdictNote}"`;
  }
  return line;
}

function formatNeverTitle(title: string): string {
  return `- "${title}"`;
}

/**
 * Build the identity-only recommendation prompt for the given shelf and taste profile.
 * `steer` is the cleaned mood text (see steer.ts). An empty or missing steer
 * leaves the prompt unchanged.
 */
export function buildRecommendPrompt(
  shelfId: RecommendShelfId,
  profile: TasteProfile,
  steer?: string,
): string {
  const label = SHELF_LABELS[shelfId];
  const creatorLabel = CREATOR_LABELS[shelfId];
  const sections: string[] = [];

  sections.push(
    `Role: recommendation engine for Theque, a personal taste library.`,
    `Task: given the user's taste profile for ${label}, suggest ${RECOMMEND_OVER_REQUEST} other ${label} they'd likely enjoy.`,
    `Look for patterns in genre, tone, era, themes, style.`,
  );

  if (profile.loved.length > 0) {
    sections.push(
      "",
      `LOVED (rated 4–5★):`,
      profile.loved.map((item) => formatProfileItem(item, true)).join("\n"),
    );
  }

  if (profile.disliked.length > 0) {
    sections.push(
      "",
      `DISLIKED (rated 1–2★) — avoid ${label} that resemble these:`,
      profile.disliked.map((item) => formatProfileItem(item, true)).join("\n"),
    );
  }

  if (profile.backlog.length > 0) {
    sections.push(
      "",
      `BACKLOG (saved, not yet consumed — weaker signal):`,
      profile.backlog.map((item) => formatProfileItem(item, false)).join("\n"),
    );
  }

  if (profile.owned && profile.owned.length > 0) {
    sections.push(
      "",
      `ALREADY IN THEIR LIBRARY (do not suggest any of these — they already have them):`,
      profile.owned.map(formatNeverTitle).join("\n"),
    );
  }

  if (profile.never.length > 0) {
    sections.push(
      "",
      `NEVER suggest these titles:`,
      profile.never.map(formatNeverTitle).join("\n"),
    );
  }

  if (steer) {
    sections.push(
      "",
      `REQUEST FOR THIS RUN: the user is in the mood for "${steer}". Every suggestion must fit this request. Use the taste profile to choose among titles that fit it.`,
    );
  }

  const hasOwned = Boolean(profile.owned && profile.owned.length > 0);
  const excludedLists = ["the NEVER list", hasOwned ? "the ALREADY IN THEIR LIBRARY list" : null]
    .filter((v): v is string => v !== null)
    .join(" or ");

  // Freshness nudge (ADR 0016): the recommend path has no search grounding, so
  // without an explicit ask even recent-knowledge models default to safe canon.
  // Relative year keeps this current without a code change each year.
  const recentFrom = new Date().getFullYear() - 1;

  sections.push(
    "",
    `Rules:`,
    `- Never suggest any title from ${excludedLists} above.`,
    `- Output identity only: title, ${creatorLabel} (as "creator"), year, a 1–2 sentence spoiler-free description, and one sentence on why it connects to their taste.`,
    `- Do NOT output URLs or links of any kind.`,
    `- Mix well-known and lesser-known titles.`,
    `- Include a strong mix of recent releases: at least half your suggestions should be from roughly ${recentFrom} or later, and must genuinely exist. Avoid direct sequels to titles already listed above.`,
    ``,
    `Respond with ONLY a JSON object of exactly this shape (no other text):`,
    `{"candidates":[{"title":string,"creator":string,"year":number,"description":string,"reason":string}]}`,
    `Return ${RECOMMEND_OVER_REQUEST} candidates in the array.`,
  );

  return sections.join("\n");
}

/**
 * The JSON schema for structured output on every recommendation model.
 * Candidates have NO url field — grounding is deterministic.
 */
export const RECOMMEND_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          creator: { type: "string" },
          year: { type: "integer" },
          description: { type: "string" },
          reason: { type: "string" },
        },
        required: ["title", "creator", "description", "reason"],
        additionalProperties: false,
      },
      minItems: 1,
      maxItems: 50,
    },
  },
  required: ["candidates"],
  additionalProperties: false,
} as const;

/**
 * Parses the model response into candidates. Returns null when the response
 * has no candidates array.
 *
 * Drops a candidate when a required field is not a string or the title is
 * empty. Sets `year` to null when it is not a positive integer. Some models
 * send 0 for an unknown year, and 0 would fail the resolver year check.
 */
export function parseLlmCandidates(data: unknown): LlmCandidate[] | null {
  if (typeof data !== "object" || data === null) return null;
  const raw = (data as { candidates?: unknown }).candidates;
  if (!Array.isArray(raw)) return null;

  const candidates: LlmCandidate[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const c = entry as Record<string, unknown>;
    if (
      typeof c.title !== "string" ||
      !c.title.trim() ||
      typeof c.creator !== "string" ||
      typeof c.description !== "string" ||
      typeof c.reason !== "string"
    ) {
      continue;
    }
    const year = typeof c.year === "number" && Number.isInteger(c.year) && c.year > 0 ? c.year : null;
    candidates.push({
      title: c.title,
      creator: c.creator,
      year,
      description: c.description,
      reason: c.reason,
    });
  }
  return candidates;
}

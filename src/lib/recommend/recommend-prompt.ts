/**
 * Prompt builder for the AI recommendation LLM layer (Workstream F).
 *
 * The LLM returns identity-only candidates (title, creator, year, description, reason).
 * It NEVER emits URLs — grounding is handled deterministically by the resolver layer.
 */

import type { RecommendInputItem, RecommendShelfId } from "@/lib/recommend/recommend-types";
import { RECOMMEND_MAX_INPUT_ITEMS, RECOMMEND_OVER_REQUEST } from "@/lib/recommend/recommend-config";

const SHELF_LABELS: Record<RecommendShelfId, string> = {
  books: "books",
  watch: "movies and TV shows",
};

const CREATOR_LABELS: Record<RecommendShelfId, string> = {
  books: "author",
  watch: "director",
};

/**
 * Format a single library item for inclusion in the prompt.
 * e.g. `- "Piranesi" by Susanna Clarke (2020)`
 */
function formatItem(item: RecommendInputItem): string {
  const parts: string[] = [`"${item.title}"`];
  if (item.creator) parts.push(`by ${item.creator}`);
  if (item.year) parts.push(`(${item.year})`);
  return `- ${parts.join(" ")}`;
}

/**
 * Build the identity-only recommendation prompt for the given shelf and library items.
 *
 * @param shelfId - "books" or "watch"
 * @param items   - The user's existing library items for this shelf (capped at RECOMMEND_MAX_INPUT_ITEMS)
 */
export function buildRecommendPrompt(
  shelfId: RecommendShelfId,
  items: RecommendInputItem[],
): string {
  const capped = items.slice(0, RECOMMEND_MAX_INPUT_ITEMS);
  const label = SHELF_LABELS[shelfId];
  const creatorLabel = CREATOR_LABELS[shelfId];

  const formattedItems = capped.map(formatItem).join("\n");

  return [
    `Role: recommendation engine for Theque, a personal taste library.`,
    `Task: given the user's saved ${label}, suggest ${RECOMMEND_OVER_REQUEST} other ${label} they'd likely enjoy.`,
    `Look for patterns in genre, tone, era, themes, style.`,
    ``,
    `Rules:`,
    `- Never suggest a title already in the user's list (shown below).`,
    `- Output identity only: title, ${creatorLabel} (as "creator"), year, a 1–2 sentence spoiler-free description, and one sentence on why it connects to their library.`,
    `- Do NOT output URLs or links of any kind.`,
    `- Mix well-known and lesser-known titles.`,
    ``,
    `User's ${label}:`,
    formattedItems,
  ].join("\n");
}

/**
 * The JSON schema enforced on Gemini's response.
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
      maxItems: 8,
    },
  },
  required: ["candidates"],
  additionalProperties: false,
} as const;

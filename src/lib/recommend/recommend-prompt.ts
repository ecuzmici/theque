/**
 * Prompt builder for the AI recommendation LLM layer (Workstream F).
 *
 * The LLM returns identity-only candidates (title, creator, year, description, reason).
 * It NEVER emits URLs — grounding is handled deterministically by the resolver layer.
 */

import type { RecommendShelfId, TasteProfile, TasteProfileItem } from "@/lib/recommend/recommend-types";
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
 */
export function buildRecommendPrompt(
  shelfId: RecommendShelfId,
  profile: TasteProfile,
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

  if (profile.never.length > 0) {
    sections.push(
      "",
      `NEVER suggest these titles:`,
      profile.never.map(formatNeverTitle).join("\n"),
    );
  }

  sections.push(
    "",
    `Rules:`,
    `- Never suggest any title from the NEVER list above.`,
    `- Output identity only: title, ${creatorLabel} (as "creator"), year, a 1–2 sentence spoiler-free description, and one sentence on why it connects to their taste.`,
    `- Do NOT output URLs or links of any kind.`,
    `- Mix well-known and lesser-known titles.`,
    ``,
    `Respond with ONLY a JSON object of exactly this shape (no other text):`,
    `{"candidates":[{"title":string,"creator":string,"year":number,"description":string,"reason":string}]}`,
    `Return ${RECOMMEND_OVER_REQUEST} candidates in the array.`,
  );

  return sections.join("\n");
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

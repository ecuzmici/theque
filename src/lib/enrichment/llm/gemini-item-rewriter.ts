import "server-only";

import type { ItemCategory } from "@/lib/database.types";
import type { RawMetadata } from "@/lib/enrichment/extract";
import {
  type LlmItemRewriteProposal,
  validateLlmItemRewriteProposal,
} from "@/lib/enrichment/llm/category-schemas";

export type GeminiItemRewriteInput = {
  finalUrl: string;
  currentCategory: ItemCategory | null;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  structured: Record<string, unknown>;
  rawMetadata: RawMetadata;
};

export type GeminiItemRewriteResult =
  | {
      status: "enhanced";
      proposal: LlmItemRewriteProposal;
      providerMetadata: Record<string, unknown>;
    }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

const itemCategoryValues: ItemCategory[] = [
  "books",
  "movies_and_tv",
  "restaurants",
  "products",
  "travel",
  "recipes",
  "articles",
  "music",
  "videos",
  "apps",
];

export function buildGeminiItemRewriteResponseJsonSchema() {
  return {
    type: "object",
    properties: {
      category: { type: "string", enum: itemCategoryValues },
      category_confidence: { type: "number", minimum: 0, maximum: 1 },
      title: { type: "string" },
      subtitle: { type: "string" },
      description: { type: "string" },
      image_url: { type: "string" },
      structured: { type: "object" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      sources: { type: "array", items: { type: "string" }, minItems: 1 },
      notes: { type: "string" },
    },
    required: ["category", "category_confidence", "confidence", "sources"],
    additionalProperties: false,
  };
}

export function buildGeminiItemRewritePrompt(input: GeminiItemRewriteInput): string {
  return [
    "You are proposing a full metadata rewrite for a single item in Theque.",
    `Current category: ${input.currentCategory ?? "uncategorized"}.`,
    "You may change category, title, description, image_url, and structured metadata.",
    "This is a review flow, so return your best proposal even when it overwrites existing fields.",
    "Use only the provided URL and metadata evidence.",
    "Return the final proposed category and structured fields that match that category.",
    "When evidence is strong from the URL or title, use it to correct obvious misclassifications.",
    "Do not invent facts like authors, prices, ratings, or dates without evidence.",
    "",
    `URL: ${input.finalUrl}`,
    `Title: ${input.title ?? ""}`,
    `Subtitle: ${input.subtitle ?? ""}`,
    `Description: ${input.description ?? ""}`,
    `Image URL: ${input.image_url ?? ""}`,
    `Structured: ${JSON.stringify(input.structured)}`,
    `Open Graph: ${JSON.stringify(input.rawMetadata.open_graph)}`,
    `Twitter: ${JSON.stringify(input.rawMetadata.twitter)}`,
    `JSON-LD: ${JSON.stringify(input.rawMetadata.json_ld)}`,
    `Parser: ${input.rawMetadata.parser}`,
  ].join("\n");
}

export function normalizeGeminiItemRewritePayload(payload: unknown): GeminiItemRewriteResult {
  const validation = validateLlmItemRewriteProposal(payload);
  if (!validation.ok) return { status: "failed", reason: validation.reason };
  return {
    status: "enhanced",
    proposal: validation.value,
    providerMetadata: {
      provider: "gemini",
      status: "enhanced",
    },
  };
}

export async function rewriteItemWithGemini(input: GeminiItemRewriteInput): Promise<GeminiItemRewriteResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { status: "skipped", reason: "missing_api_key" };

  const timeoutMs = Number.parseInt(process.env.GEMINI_TIMEOUT_MS ?? "10000", 10);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 10000);

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const prompt = buildGeminiItemRewritePrompt(input);

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        abortSignal: controller.signal,
        temperature: 0.1,
        responseMimeType: "application/json",
        responseJsonSchema: buildGeminiItemRewriteResponseJsonSchema(),
      },
    });

    const text = response.text;
    const parsed = typeof text === "string" ? JSON.parse(text) : null;
    const normalized = normalizeGeminiItemRewritePayload(parsed);
    if (normalized.status !== "enhanced") return normalized;

    return {
      ...normalized,
      providerMetadata: {
        ...normalized.providerMetadata,
        model,
      },
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "gemini_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

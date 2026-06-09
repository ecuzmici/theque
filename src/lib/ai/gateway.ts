/**
 * Vercel AI Gateway helper.
 *
 * One unified entry point for the LLM calls in this app (recommendations and
 * category enrichment). Model ids are plain gateway strings like
 * "openai/gpt-5-mini" or "google/gemini-2.5-flash"; the AI SDK routes them
 * through the gateway automatically.
 *
 * Authentication is handled by the AI SDK with no per-call config:
 * - On Vercel deployments, OIDC (`VERCEL_OIDC_TOKEN`) is injected automatically.
 * - Locally, set `AI_GATEWAY_API_KEY` (Vercel dashboard → AI Gateway → API Keys).
 *
 * Reliability: the gateway only auto-fails-over across *providers of the same
 * model*. To survive a whole model/provider being overloaded (the 503 "high
 * demand" failure mode), this helper tries an ordered list of models and moves
 * to the next one on any error.
 */

import "server-only";

import { generateText } from "ai";

/** Returns true when the gateway can authenticate (local key or Vercel OIDC). */
export function isGatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

/** Parse a comma-separated env var into a trimmed, non-empty model list. */
export function parseModelList(value: string | undefined, fallback: string[]): string[] {
  const parsed = (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

const JSON_SYSTEM =
  "You are a precise data API. Respond with only a single valid, minified JSON value " +
  "matching the requested shape. No prose, no explanation, no markdown, no code fences.";

/** Strip an accidental ```json … ``` fence the model may wrap the JSON in. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

export type GatewayJsonOptions = {
  /** Ordered fallback list, e.g. ["openai/gpt-5-mini", "google/gemini-2.5-flash"]. */
  models: string[];
  prompt: string;
  /** Overrides the default JSON-only system instruction when provided. */
  system?: string;
  temperature?: number;
  timeoutMs?: number;
  /** Short label for logs (e.g. "recommend", "enrich"). */
  label: string;
};

export type GatewayJsonResult<T> = {
  data: T;
  /** The model id that actually produced the result. */
  model: string;
};

/**
 * Generate JSON from the first model in `models` that succeeds.
 *
 * Each model gets one attempt with its own timeout; on any error (overload,
 * timeout, invalid JSON) the next model is tried. Throws the last error if
 * every model fails. Callers are responsible for validating the parsed shape.
 */
export async function generateJsonWithFallback<T = unknown>(
  opts: GatewayJsonOptions,
): Promise<GatewayJsonResult<T>> {
  const { models, prompt, system, temperature, timeoutMs = 20000, label } = opts;
  if (models.length === 0) throw new Error("no_models_configured");

  let lastError: unknown;
  for (const model of models) {
    try {
      const { text } = await generateText({
        model,
        system: system ?? JSON_SYSTEM,
        prompt,
        temperature,
        abortSignal: AbortSignal.timeout(timeoutMs),
      });
      if (!text) throw new Error("empty_response");
      const data = JSON.parse(stripCodeFence(text)) as T;
      return { data, model };
    } catch (err) {
      lastError = err;
      console.warn(
        `[ai/gateway] ${label} model_failed model=${model}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  throw lastError ?? new Error("all_models_failed");
}

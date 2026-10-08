import { isGatewayConfigured, parseModelList } from "@/lib/ai/gateway-config";

/**
 * Ordered AI Gateway model fallback for item enrichment (background enhancer
 * and the manual "Enrich with AI" rewrite).
 *
 * Chosen from a benchmark on 2026-10-08 (ADR 0017): the 10 eval cases in
 * scripts/eval-gemini-prompt.ts, run twice per model, plus a recent-release
 * knowledge quiz.
 *
 * gpt-6-luna: primary. Mean score 4.5/5, 20/20 valid JSON, p90 1.9s, newest
 * knowledge cutoff (2026-05). claude-haiku-5.5: fallback on a second provider.
 * Mean score 4.0/5, 20/20 valid JSON, p90 4.4s.
 *
 * Rejected: Gemini through the gateway (scores 2.6-2.9 and gateway retry
 * timeouts), deepseek-v4.1-flash and mimo-v2.6-flash (p90 near the timeout),
 * mistral-large-4 and qwen3.8-flash (timed out on most calls).
 */
export const DEFAULT_ENRICHMENT_MODELS = ["openai/gpt-6-luna", "anthropic/claude-haiku-5.5"];

export function enrichmentModels(): string[] {
  return parseModelList(process.env.ENRICHMENT_MODELS, DEFAULT_ENRICHMENT_MODELS);
}

/**
 * Turns off reasoning on each provider so a call stays inside the enrichment
 * timeout. Each key applies only to models of that provider.
 */
export const ENRICHMENT_PROVIDER_OPTIONS = {
  openai: { reasoningEffort: "none" },
  anthropic: { thinking: { type: "disabled" }, effort: "low" },
};

const DEFAULT_TIMEOUT_MS = 15000;

/** Per-model timeout. ENRICHMENT_TIMEOUT_MS overrides the 15s default. */
export function enrichmentTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.ENRICHMENT_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/** True when enrichment can call the AI Gateway (local key or Vercel OIDC). */
export function isEnrichmentLlmConfigured(): boolean {
  return isGatewayConfigured();
}

/** Provider label written to raw_metadata.llm and proposal_metadata. */
export const ENRICHMENT_LLM_PROVIDER = "ai_gateway";

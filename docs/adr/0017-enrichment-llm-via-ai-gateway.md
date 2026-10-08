---
status: accepted
---

# Run LLM enrichment through the AI Gateway on gpt-6-luna, with claude-haiku-5.5 as fallback

## Context

LLM enrichment has two paths:

1. The background enhancer (`gemini-category-enhancer.ts`) fills sparse metadata after classification.
2. The manual "Enrich with AI" rewrite (`gemini-item-rewriter.ts`) proposes a full metadata rewrite for review.

Both paths called the Gemini SDK directly with `gemini-2.5-flash-lite` and `gemini-2.5-flash`. These models are old. Their knowledge stops before 2025, and about 27% of the fields that the LLM fills come from model knowledge (ADR 0011). Google now recommends the 3.x models for new projects.

The recommendation deck already uses the AI Gateway (`src/lib/ai/gateway.ts`). The gateway gives access to models from many providers with one credential.

## Benchmark (2026-10-08)

We ran the 10 eval cases in `scripts/eval-gemini-prompt.ts` two times for each model. Each run used the production prompt (`buildGeminiCategoryPromptV3`), a JSON schema, and the eval scorer (0 to 5 points). A quiz of 8 questions about 2025 and 2026 releases measured knowledge recency.

| Model | Route | Mean score | Valid JSON | p90 latency | Cost per call | Quiz |
|---|---|---|---|---|---|---|
| gemini-2.5-flash-lite (old primary) | Gemini API | 3.70 | 20/20 | 1.0s | $0.0002 | 0/8 |
| gemini-2.5-flash (old fallback) | Gemini API | 3.85 | 19/20 | 1.1s | $0.0007 | 2/8 |
| gemini-3.5-flash-lite | Gemini API | 3.80 | 20/20 | 1.4s | $0.0008 | 6/8 |
| gemini-3.8-flash | Gemini API | 4.10 | 20/20 | 3.0s | $0.0015 | 7/8 |
| gemini-3.8-flash | Gateway | 2.90 | 17/20 | 2.8s | n/a | 7/8 |
| openai/gpt-6-luna | Gateway | 4.50 | 20/20 | 1.9s | $0.00008 | 8/8 |
| anthropic/claude-haiku-5.5 | Gateway | 4.00 | 20/20 | 4.4s | $0.00036 | 8/8 |
| deepseek/deepseek-v4.1-flash | Gateway | 4.80 | 20/20 | 13.5s | $0.0017 | 8/8 |
| xiaomi/mimo-v2.6-flash | Gateway | 4.60 | 18/20 | 11.0s | $0.00014 | 7/8 |
| zai/glm-5.3-flash | Gateway | 4.35 | 20/20 | 6.3s | $0.00035 | 8/8 |

Other results:

- `mistral/mistral-large-4` and `alibaba/qwen3.8-flash` timed out on most calls.
- `gemini-3.6-flash` sometimes produced very long output and timed out (p90 18.3s).
- `gemini-3.5-flash-lite` rejects `thinkingBudget: 0`. `gemini-3.7-flash` and `gemini-3.8-flash` reject `thinkingLevel: MINIMAL`.

The sample is small (20 calls for each model). Score differences under 0.3 are noise.

## Decision

1. Both enrichment paths call the AI Gateway through `generateJsonWithFallback`. The helper now accepts a JSON `schema` for structured output.
2. The model order is `openai/gpt-6-luna`, then `anthropic/claude-haiku-5.5`. The `ENRICHMENT_MODELS` env var overrides the order. The config is in `src/lib/enrichment/llm/llm-config.ts`.
3. Reasoning is off for each provider, so a call stays inside the 15s timeout.
4. A model that errors, times out, or returns a payload that fails validation causes the next model to run.
5. `normalizeLlmPayload` cleans each payload before validation. The gateway models send `""` and `0` for unknown fields. Gemini omitted those fields. The cleaner removes empty values and structured zeros. It labels an unknown `field_sources` value as `model_knowledge`, so the merge still blocks volatile facts from memory.
6. `raw_metadata.llm.provider` and `proposal_metadata.provider` are now `ai_gateway`. Older rows keep `gemini`.
7. Grounded search stays on the Gemini API, because it needs Google Search. Its default model is now `gemini-3.5-flash-lite`.
8. The `gemini-*` file and function names stay as they are. A rename is a separate change.

## Consequences

- Enrichment needs AI Gateway auth: `AI_GATEWAY_API_KEY` locally, OIDC on Vercel. `GEMINI_API_KEY` is necessary only for grounding.
- Enrichment uses gateway credits. At 1,000 enrichments, the cost is about $0.10 on gpt-6-luna.
- A gateway outage stops enrichment. Deterministic extraction continues without the LLM.
- When many requests run in parallel, the gateway can return "A positive credit balance is required" while the balance is positive. We saw this with 11 parallel benchmark runs. The enrichment job runs items one at a time, so the risk is low.

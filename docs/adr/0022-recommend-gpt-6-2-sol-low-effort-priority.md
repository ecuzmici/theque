---
status: accepted
---

# Recommend with gpt-6.2-sol at low effort on the priority tier

## Context

ADR 0018 put `google/gemini-3.6-flash` first in the recommendation order. On 2026-11-19 the owner asked for a stronger model inside the free AI Gateway credit.

The credit endpoint showed $15.00 in total: $1.40 used from June to 2026-11-19, and $13.60 left. The outcome log shows at most about 26 recommendation runs in one month (July 2026).

We measured each model on the owner's real books prompt: about 2.4k input tokens, 24 candidates out, structured output. The probe called the AI Gateway directly and read the token usage and cost from the response.

## Measurements

| Model | Settings | Time | Reasoning tokens | Cost per run |
|---|---|---|---|---|
| google/gemini-3.6-flash | `thinkingLevel: "minimal"` | 14 s | 0 | about $0.01 |
| openai/gpt-6.2-sol | `reasoningEffort: "none"` | 87 s | 1,290 | $0.045 |
| openai/gpt-6.2-sol | `reasoningEffort: "minimal"` | 77 s | 1,269 | $0.038 |
| openai/gpt-6.2-sol | `reasoningEffort: "low"` | 52-57 s | 0 | $0.024-0.032 |
| openai/gpt-6.2-sol | `"low"` and `serviceTier: "priority"` | 21-23 s | 0 | $0.047-0.062 |
| anthropic/claude-sonnet-5.5 | thinking off | 22 s | 0 | $0.034 |

- gpt-6.2-sol ignores `"none"` and `"minimal"`. Only `"low"` turns its reasoning off.
- The priority tier doubles the token price and halves the time.
- The yield eval (`npm run eval:recommend`) with the new order gave 3/3 full rounds on books (71 of 72 candidates resolved) and 3/3 on watch (72 of 72). Most picks were 2024-2026 releases.
- claude-sonnet-5.5 picked mostly canon (Dune, Ender's Game, The Hunger Games). One round returned 2 candidates.
- gpt-6.2-sol rejected `RECOMMEND_RESPONSE_SCHEMA`: OpenAI strict mode needs every property in `required`, and `year` was optional.

## Decision

1. The model order is `openai/gpt-6.2-sol`, `google/gemini-3.6-flash`, then `google/gemini-3.5-flash-lite`.
2. `RECOMMEND_PROVIDER_OPTIONS.openai` is `{ reasoningEffort: "low", serviceTier: "priority" }`.
3. `RECOMMEND_PROVIDER_OPTIONS.anthropic` turns thinking off, for a Claude model that `RECOMMEND_MODELS` adds.
4. `RECOMMEND_TIMEOUT_MS` defaults to 45000.
5. `RECOMMEND_RESPONSE_SCHEMA` lists `year` in `required`, with the type integer or null.
6. gpt-6-luna leaves the order. It repeats earlier picks (ADR 0018).

## Consequences

- A run costs about $0.055, up from about $0.01. At 26 runs a month, that is about $1.50.
- A run takes about 22 s, up from about 14 s. The deck can be minimized while it runs (ADR 0005).
- When gpt-6.2-sol fails or passes 45 s, gemini-3.6-flash answers. Three timeouts take about 2 min 15 s, inside the 300 s function limit.
- Re-run the probe before you change the OpenAI options. A new model version can change what each reasoning setting does.

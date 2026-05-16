# Gemini Category Enrichment Plan Review Prompt

Use this prompt with another agent after you have both plans available.

```text
You are reviewing two implementation plans for adding LLM-powered category enrichment to Theque, a personal visual bookmark library.

Your task is to compare Plan A and Plan B, identify the strongest ideas from each, catch risks or missing requirements, and produce one final implementation plan.

Context:
- Theque is a Next.js App Router app with Supabase.
- Existing capture flow inserts an `items` row and triggers `src/lib/jobs/enrich-item.ts`.
- Current enrichment fetches HTML, extracts OG/Twitter/JSON-LD/domain parser metadata, applies deterministic fallbacks, classifies using `src/lib/classify/index.ts`, then writes top-level fields plus `structured` and `raw_metadata`.
- Current product constraint: classification is deterministic only. Domain map, schema.org, and heuristics are the source of truth.
- The desired feature is category-specific enrichment, not AI classification.
- User has Gemini API access.
- Perplexity Pro is only the consumer web app subscription for now. Do not require Perplexity API in v1 and do not suggest browser automation against Perplexity Pro.
- Future Perplexity API support may be designed as a provider slot for sparse or blocked pages.

Plan A:
C:\Users\emilc\.gemini\antigravity\brain\40c72cad-2988-4e92-bf52-928ae91433e2\artifacts\llm_enrichment_brainstorm.md

Plan B:
C:\Users\emilc\projects\bookmarkly\docs\superpowers\plans\2026-05-16-gemini-category-enrichment.md

Evaluate both plans against these criteria:
1. Preserves deterministic classification and manual category overrides.
2. Improves category-specific `structured` fields without inventing unsupported data.
3. Keeps API keys server-only and never exposes Gemini credentials to the browser.
4. Fails open so deterministic enrichment still succeeds when Gemini fails.
5. Uses conservative merge rules that avoid overwriting strong parser output.
6. Has clear validation for model output before writing to Supabase.
7. Has bounded cost and latency through env gating and eligibility rules.
8. Fits the existing codebase with minimal, focused changes.
9. Includes useful tests with mocked model calls.
10. Leaves a clean path for future Perplexity API research evidence without implementing it now.

Output format:

## Comparison Summary
- State which plan is stronger overall and why.
- List the best ideas from Plan A.
- List the best ideas from Plan B.
- List any risky or unnecessary ideas that should be removed.

## Final Decisions
- Provider approach: direct Gemini SDK/API vs Vercel AI SDK, with rationale.
- Where the enhancer lives in the codebase.
- Eligibility rules for calling Gemini.
- Validation strategy for Gemini output.
- Merge strategy for top-level fields, `structured`, and `raw_metadata.llm`.
- Testing strategy.
- Rollout strategy.

## Final Implementation Plan
Write a final task-by-task implementation plan. Include exact file paths, test files, commands to run, and expected results. Keep the plan scoped to Gemini-only v1 and defer Perplexity API to a future section.

## Open Questions
List only questions that block implementation. Do not include questions that can be resolved by reading the codebase or provider docs.
```


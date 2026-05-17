# AI Recommendations — Design Spec

**Date:** 2026-05-17  
**Status:** Draft  
**Scope:** Books and Watch shelves only (PoC)

## Summary

Shelf-scoped AI recommendations. When a user is browsing the Books or Watch shelf, they can click a "Recommend" button to receive 5 streaming suggestions from Gemini 2.5 Pro. Recommendations appear as rich cards in a slide-out drawer, each with a "Save" action that feeds the suggested URL into the existing capture/enrichment pipeline.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Interaction model | Shelf-scoped | Natural: user is already in a category mindset |
| Output format | Hybrid (rich cards + suggested URLs) | Best of both: visual preview + one-click save |
| Model | Gemini 2.5 Pro (separate from Flash enrichment) | Recommendation needs world knowledge and taste reasoning |
| Persistence | Ephemeral (drawer, no DB) | Zero schema changes; save individually via capture |
| Supported shelves | Books, Watch | Strongest Gemini knowledge domains |
| Streaming | NDJSON over ReadableStream | Cards appear one-by-one; premium feel |

## Architecture & Data Flow

```
User clicks "Recommend" on Books/Watch shelf
        ↓
Client collects shelf items (title, subtitle, structured fields)
  — capped at 20 most recent items
        ↓
POST /api/recommend  { shelfId, items[] }
  — auth: session cookie
  — validates shelfId ∈ { "books", "watch" }
        ↓
Server builds category-aware prompt
        ↓
Gemini 2.5 Pro streaming call (temperature 0.8)
        ↓
Server parses stream, emits NDJSON (one recommendation per line)
        ↓
Client renders each RecommendationCard as it arrives
        ↓
"Save" → POST /api/capture → normal enrichment pipeline
"Search instead" → opens Google search with pre-built query
```

## API Contract

### `POST /api/recommend`

**Auth:** Session cookie (same as library routes). Returns 401 if unauthenticated.

**Request body:**

```ts
type RecommendRequest = {
  shelfId: "books" | "watch";
  items: RecommendInputItem[];  // max 20
};

type RecommendInputItem = {
  title: string;
  subtitle: string | null;
  structured: Record<string, unknown>;  // authors, year, genres, directors, etc.
};
```

**Response:** `200 OK`, `Content-Type: application/x-ndjson`, streamed.

Each line is a complete JSON object:

```ts
type RecommendationLine =
  | { type: "recommendation"; data: Recommendation }
  | { type: "done"; count: number }
  | { type: "error"; message: string };

type Recommendation = {
  id: string;               // server-generated UUID for React keying
  title: string;
  subtitle: string;         // e.g. "Susanna Clarke · 2020"
  description: string;      // 1-2 sentence pitch
  suggested_url: string;    // best-guess Goodreads/IMDb link
  search_query: string;     // fallback Google search query
  reason: string;           // why this was recommended ("Because you saved Dune and Hyperion…")
};
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| 400 | Invalid shelfId, empty items, items > 20 |
| 401 | Not authenticated |
| 429 | Rate limit exceeded (see Configuration) |
| 500 | Gemini API failure (after stream has not started) |

If Gemini fails mid-stream, the server emits a `{ type: "error" }` line and closes.

### Input preparation (client-side)

The client prepares `items[]` from the already-loaded shelf data (`LibraryItemRow[]`):

```ts
function prepareRecommendInput(items: LibraryItemRow[]): RecommendInputItem[] {
  return items
    .filter(i => i.title)                    // skip untitled
    .slice(0, 20)                            // cap at 20
    .map(i => ({
      title: i.title!,
      subtitle: i.subtitle,
      structured: i.structured as Record<string, unknown>,
    }));
}
```

## Prompt Design

### System prompt structure

The prompt is category-aware. Two templates: one for books, one for movies/TV.

```
Role: You are a recommendation engine for Theque, a personal visual bookmark library.

Task: Given the user's saved {category} items below, suggest exactly 5 new
{category} they would likely enjoy. Focus on taste affinity — look for patterns
in genre, tone, era, themes, and style across their collection.

Rules:
- Return exactly 5 recommendations.
- Never recommend items already in the user's list.
- For each recommendation, provide:
  - title: exact, official title
  - subtitle: "{creator} · {year}" format
  - description: 1-2 sentence compelling pitch (no spoilers)
  - suggested_url: a real {domain_hint} URL for this item
  - search_query: Google search query to find this item
  - reason: 1 sentence explaining the connection to items in their library
- Vary your recommendations: mix well-known and lesser-known titles.
- Do not explain your reasoning outside the structured output.

User's {category} library:
{formatted_items}
```

**Category-specific hints:**

| Category | `domain_hint` | Creator field | Extra structured context |
|----------|---------------|---------------|------------------------|
| books | `goodreads.com/book/show/` | `authors` | `published_year`, `page_count` |
| movies_and_tv | `imdb.com/title/` | `directors` | `year`, `genres`, `media_type`, `runtime_minutes` |

### Item formatting in prompt

Each item is rendered as a compact text block:

```
- "Project Hail Mary" by Andy Weir (2021) — Sci-fi, 476 pages
- "Piranesi" by Susanna Clarke (2020) — Fantasy
```

For movies:

```
- "Blade Runner 2049" dir. Denis Villeneuve (2017) — Sci-Fi, Drama, 164 min
- "Arrival" dir. Denis Villeneuve (2016) — Sci-Fi, Drama, 116 min
```

### JSON schema enforcement

Use `responseMimeType: "application/json"` with a `responseJsonSchema` that matches an array of 5 `Recommendation` objects. This prevents freeform text output.

```ts
const recommendationJsonSchema = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          description: { type: "string" },
          suggested_url: { type: "string" },
          search_query: { type: "string" },
          reason: { type: "string" },
        },
        required: ["title", "subtitle", "description", "suggested_url", "search_query", "reason"],
      },
      minItems: 5,
      maxItems: 5,
    },
  },
  required: ["recommendations"],
};
```

### Streaming JSON parsing

Gemini's streaming API with JSON schema returns partial JSON tokens. The server accumulates tokens until a complete recommendation object is parseable, then emits it as an NDJSON line. A lightweight incremental JSON parser handles this:

1. Accumulate text chunks from Gemini stream.
2. After each chunk, attempt to extract complete objects from the `recommendations` array.
3. For each newly complete object, emit it as `{ type: "recommendation", data: ... }` and flush.
4. After stream ends, emit `{ type: "done", count }`.

## UI Components

### `RecommendButton`

- Rendered in the shelf header area, next to the shelf tabs.
- Only visible on `books` and `watch` shelves.
- Only enabled when the shelf has ≥ 3 items (`RECOMMEND_MIN_ITEMS = 3`).
- Disabled state shows tooltip: "Save at least 3 items to get recommendations".
- Icon: sparkle/magic-wand style icon + "Recommend" label.
- On click: opens the `RecommendDrawer` and fires the API call.

### `RecommendDrawer`

- Slide-in drawer from the right (uses existing sheet/drawer pattern from shadcn).
- Header: "Recommendations for you" + shelf label.
- Body: vertical stack of `RecommendationCard` components.
- Loading state: subtle skeleton cards that get replaced as real cards stream in.
- Empty/error state: friendly message with retry button.
- Footer: "These suggestions are AI-generated and may not be accurate." disclaimer.

### `RecommendationCard`

- Compact horizontal card layout:
  - Left: category-colored placeholder (same gradient style as `ItemCard` when no image).
  - Right: title (bold), subtitle (muted), description (small), reason (italic, muted).
- Actions:
  - **"Save to Library"** button → calls `/api/capture` with `suggested_url`, closes card with success toast.
  - **"Search"** link → opens `https://www.google.com/search?q={search_query}` in new tab.
  - **"Dismiss"** (×) → removes card from drawer (ephemeral, no API call).
- Entrance animation: fade-in + slight slide-up as each card arrives from the stream.

### State management

```ts
type RecommendState =
  | { status: "idle" }
  | { status: "loading"; recommendations: Recommendation[] }  // partial results
  | { status: "done"; recommendations: Recommendation[] }
  | { status: "error"; message: string; recommendations: Recommendation[] };
```

A `useRecommendations` hook manages the NDJSON stream:

```ts
function useRecommendations() {
  const [state, setState] = useState<RecommendState>({ status: "idle" });

  async function fetchRecommendations(shelfId: string, items: RecommendInputItem[]) {
    setState({ status: "loading", recommendations: [] });
    const res = await fetch("/api/recommend", {
      method: "POST",
      body: JSON.stringify({ shelfId, items }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const recs: Recommendation[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Split on newlines, parse complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop()!;  // keep incomplete last line

      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line);
        if (parsed.type === "recommendation") {
          recs.push(parsed.data);
          setState({ status: "loading", recommendations: [...recs] });
        } else if (parsed.type === "done") {
          setState({ status: "done", recommendations: [...recs] });
        } else if (parsed.type === "error") {
          setState({ status: "error", message: parsed.message, recommendations: [...recs] });
        }
      }
    }
  }

  return { state, fetchRecommendations };
}
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Missing `GEMINI_API_KEY` | 500 response: `{ error: "Recommendations not configured" }`. Button hidden if feature flag is off. |
| Gemini timeout (>30s) | Server aborts stream, emits `{ type: "error" }`. Client shows "Took too long" with retry. |
| Gemini rate limit (429) | Server returns 429. Client shows "Try again in a moment." |
| Mid-stream failure | Server emits error line. Client keeps any cards already received + shows error banner at bottom. |
| Invalid/unparseable recommendation | Server skips the malformed entry, does not emit it. `done.count` reflects actual emitted count. |
| "Save" fails (bad URL) | Toast: "Couldn't save — URL may be unavailable." Card shows "Search instead" prominently. |
| Shelf has < 3 items | Button disabled with tooltip. No API call. |

## Configuration

New environment variables (all optional, feature disabled without API key):

```env
# Already exists — shared with enrichment
GEMINI_API_KEY=

# Recommendation-specific
GEMINI_RECOMMEND_MODEL=gemini-2.5-pro        # default: gemini-2.5-pro
GEMINI_RECOMMEND_TIMEOUT_MS=30000            # default: 30000 (longer than enrichment)
GEMINI_RECOMMEND_TEMPERATURE=0.8             # default: 0.8
RECOMMEND_MIN_ITEMS=3                        # default: 3
RECOMMEND_MAX_INPUT_ITEMS=20                 # default: 20
RECOMMEND_COUNT=5                            # default: 5
RECOMMEND_RATE_LIMIT_PER_HOUR=10             # default: 10 per user per hour
```

**Rate limiting:** Simple in-memory rate limiter (Map<userId, timestamps[]>). Sufficient for single-user PoC. No Redis needed.

**Feature gating:** The Recommend button is only rendered when `GEMINI_API_KEY` is set. Server checks this via a new `isRecommendEnabled()` utility that mirrors the existing `isLlmEnrichmentEnabled()` pattern. Unlike enrichment, recommendations do NOT require `LLM_ENRICHMENT_ENABLED` — they use a separate code path.

## File Structure

New files:

```
src/
├── app/api/recommend/
│   └── route.ts                    # POST handler, streaming response
├── lib/recommend/
│   ├── recommend-prompt.ts         # Prompt builder (books + movies templates)
│   ├── recommend-prompt.test.ts    # Prompt snapshot tests
│   ├── recommend-stream.ts         # Gemini streaming → NDJSON transform
│   ├── recommend-types.ts          # Shared types (Recommendation, RecommendRequest, etc.)
│   ├── recommend-config.ts         # Env var parsing, feature gate, rate limit
│   └── recommend-config.test.ts    # Config parsing tests
├── components/recommend/
│   ├── RecommendButton.tsx         # Shelf header button
│   ├── RecommendDrawer.tsx         # Drawer container + stream state
│   ├── RecommendationCard.tsx      # Individual recommendation card
│   └── useRecommendations.ts       # NDJSON stream hook
```

Modified files:

```
src/app/(app)/library/page.tsx      # Wire RecommendButton into shelf header
.env.local.example                  # Document new env vars
```

## Testing Strategy

| Layer | What to test | How |
|-------|-------------|-----|
| Prompt builder | Correct formatting for books vs movies; item cap; edge cases (missing fields) | Unit tests (Vitest) |
| Config | Env var parsing, defaults, feature gate logic | Unit tests |
| API route | Auth check, input validation, shelf restriction, rate limit | Integration tests with mocked Gemini |
| NDJSON stream | Correct parsing of partial chunks, error recovery | Unit tests with mock ReadableStreams |
| UI hook | State transitions (idle → loading → done/error), partial results | Unit tests with mock fetch |

No E2E tests for PoC — manual QA with real Gemini calls against production.

## Out of Scope (future work)

- Grounded search (Google Search API) for verified URLs
- Persistent recommendation history
- Collection-scoped recommendations
- Additional shelf categories (eat, travel, cook, read, shop)
- User feedback loop ("👍 good / 👎 bad" on recommendations to improve future results)
- De-duplication against existing library items (currently relies on Gemini prompt instruction)

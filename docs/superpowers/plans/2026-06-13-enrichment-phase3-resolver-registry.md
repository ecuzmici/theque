# Enrichment Phase 3 — Free Category Resolver Registry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill category-specific structured fields from free public APIs (TMDB, Google Books, iTunes, YouTube oEmbed, GitHub) before spending an LLM call, raising quality and lowering cost.

**Architecture:** A category-keyed resolver registry in `src/lib/enrichment/resolvers/`, modeled on the existing `openlibrary.ts`. Each resolver takes the current evidence and returns a partial patch (`ResolverPatch`) or `null`. `enrichItem` runs the registry after classification, only when a category's important fields are still sparse, and merges the patch as a deterministic source ranked above the LLM.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, `assertSafeFetchUrl` SSRF guard, free public REST/oEmbed APIs.

**Spec:** `docs/superpowers/specs/2026-06-13-enrichment-phase3-resolver-registry-design.md`

**Base branch:** branch off the current merged `feat/phase-1-2` (or master containing phase 1).

**Conventions:**
- Commands run from repo root. Shell is PowerShell — chain with `;`, never `&&`.
- `npx vitest run <file>` for one file; `npm test` for the suite.
- Commit after each task. Never commit `.env.local`.
- Every resolver is `"server-only"`, 8 s timeout, SSRF-guarded, fail-open (`null` on any miss/error, never throws out).

**Parallel-execution note:** Tasks 1–6 create only NEW files and are fully independent of Phase 2. Task 7 edits the SHARED file `src/lib/jobs/enrich-item.ts`; Task 8 edits shared docs. See "Parallel execution with Phase 2" at the end before running Task 7 in parallel with a Phase 2 session.

---

### Task 1: Resolver types + registry runner

**Files:**
- Create: `src/lib/enrichment/resolvers/types.ts`
- Create: `src/lib/enrichment/resolvers/index.ts`
- Create: `src/lib/enrichment/resolvers/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/enrichment/resolvers/index.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import type { CategoryResolver } from "@/lib/enrichment/resolvers/types";
import { runResolvers } from "@/lib/enrichment/resolvers/index";

const ok: CategoryResolver = async () => ({ source: "ok", structured: { year: 2008 } });
const miss: CategoryResolver = async () => null;
const boom: CategoryResolver = async () => {
  throw new Error("network");
};

const input = { canonicalUrl: "https://example.com", title: "X", structured: {} };

describe("runResolvers", () => {
  it("returns the first non-null patch", async () => {
    const patch = await runResolvers([miss, ok], input);
    expect(patch).toEqual({ source: "ok", structured: { year: 2008 } });
  });

  it("returns null when every resolver misses", async () => {
    expect(await runResolvers([miss, miss], input)).toBeNull();
  });

  it("swallows a throwing resolver and continues", async () => {
    const patch = await runResolvers([boom, ok], input);
    expect(patch?.source).toBe("ok");
  });

  it("returns null for an empty resolver list", async () => {
    expect(await runResolvers([], input)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/enrichment/resolvers/index.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the types**

Create `src/lib/enrichment/resolvers/types.ts`:

```typescript
/**
 * Free category resolvers — deterministic public-API lookups that fill
 * sparse structured fields before any LLM call. Modeled on openlibrary.ts:
 * server-only, SSRF-guarded, fail-open (return null on any miss/error).
 */
export type ResolverInput = {
  canonicalUrl: string;
  title: string | null;
  structured: Record<string, unknown>;
};

export type ResolverPatch = {
  title?: string;
  description?: string;
  image_url?: string;
  structured?: Record<string, unknown>;
  /** Provenance label, e.g. "tmdb", "google_books", "itunes". */
  source: string;
};

export type CategoryResolver = (input: ResolverInput) => Promise<ResolverPatch | null>;
```

- [ ] **Step 4: Write the registry runner**

Create `src/lib/enrichment/resolvers/index.ts`. The category→resolvers map is populated in later tasks; export it empty-typed now and a runner that is defensive against throwing resolvers:

```typescript
import "server-only";

import type { ItemCategory } from "@/lib/database.types";
import type { CategoryResolver, ResolverInput, ResolverPatch } from "@/lib/enrichment/resolvers/types";
import { resolveBooks } from "@/lib/enrichment/resolvers/google-books";
import { resolveApp } from "@/lib/enrichment/resolvers/github";
import { resolveMusic } from "@/lib/enrichment/resolvers/itunes";
import { resolveMovie } from "@/lib/enrichment/resolvers/tmdb";
import { resolveVideo } from "@/lib/enrichment/resolvers/youtube-oembed";

/**
 * Resolvers per category, tried in array order. Categories without a free
 * deterministic source (restaurants, travel, recipes, articles, products) are
 * intentionally absent — covered by deterministic parsing or phase-2 grounding.
 */
export const resolversByCategory: Partial<Record<ItemCategory, CategoryResolver[]>> = {
  movies_and_tv: [resolveMovie],
  books: [resolveBooks],
  music: [resolveMusic],
  videos: [resolveVideo],
  apps: [resolveApp],
};

/** Run resolvers in order; return the first non-null patch. Defensive against throws. */
export async function runResolvers(
  resolvers: CategoryResolver[],
  input: ResolverInput,
): Promise<ResolverPatch | null> {
  for (const resolver of resolvers) {
    try {
      const patch = await resolver(input);
      if (patch) return patch;
    } catch {
      /* fail-open: try the next resolver */
    }
  }
  return null;
}

/** Resolve category evidence for an item, or null when no resolver applies/matches. */
export async function resolveCategoryEvidence(
  category: ItemCategory | null,
  input: ResolverInput,
): Promise<ResolverPatch | null> {
  if (!category) return null;
  const resolvers = resolversByCategory[category];
  if (!resolvers || resolvers.length === 0) return null;
  return runResolvers(resolvers, input);
}
```

NOTE: this file imports the five resolver modules created in Tasks 2–6. Until those exist it will not compile. Either stub the five modules first (each `export const resolveX: CategoryResolver = async () => null;`) or implement Tasks 2–6 before running the full type check. The unit test for `runResolvers` passes types directly and does not need the resolver modules — run it in isolation now, do the full `tsc` after Task 6.

- [ ] **Step 5: Run the runner test**

Run: `npx vitest run src/lib/enrichment/resolvers/index.test.ts`
Expected: PASS (4 tests). (`runResolvers` has no dependency on the resolver modules.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/enrichment/resolvers/types.ts src/lib/enrichment/resolvers/index.ts src/lib/enrichment/resolvers/index.test.ts
git commit -m "feat: add category resolver registry types and runner"
```

---

### Task 2: TMDB movies/TV resolver (reuses recommend resolver)

Wrap the existing `resolveMovieWithTmdb` (`src/lib/recommend/resolve/tmdb.ts`) — it already does the search, SSRF guard, timeout, and key gating.

**Files:**
- Create: `src/lib/enrichment/resolvers/tmdb.ts`
- Create: `src/lib/enrichment/resolvers/tmdb.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/enrichment/resolvers/tmdb.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

const resolveMovieWithTmdb = vi.fn();
vi.mock("@/lib/recommend/resolve/tmdb", () => ({ resolveMovieWithTmdb }));

import { resolveMovie } from "@/lib/enrichment/resolvers/tmdb";

afterEach(() => resolveMovieWithTmdb.mockReset());

describe("resolveMovie", () => {
  it("returns null when title is missing", async () => {
    expect(await resolveMovie({ canonicalUrl: "https://x", title: null, structured: {} })).toBeNull();
    expect(resolveMovieWithTmdb).not.toHaveBeenCalled();
  });

  it("maps a TMDB hit to a patch with image, year, and media_type", async () => {
    resolveMovieWithTmdb.mockResolvedValue({
      canonical_url: "https://www.themoviedb.org/movie/155",
      cover_url: "https://image.tmdb.org/t/p/w500/poster.jpg",
      confirmed_year: 2008,
      verified_author: null,
    });

    const patch = await resolveMovie({
      canonicalUrl: "https://www.imdb.com/title/tt0468569/",
      title: "The Dark Knight",
      structured: { year: 2008 },
    });

    expect(patch).toEqual({
      source: "tmdb",
      image_url: "https://image.tmdb.org/t/p/w500/poster.jpg",
      structured: { year: 2008, media_type: "movie" },
    });
    expect(resolveMovieWithTmdb).toHaveBeenCalledWith({
      title: "The Dark Knight",
      creator: null,
      year: 2008,
    });
  });

  it("returns null when TMDB has no match", async () => {
    resolveMovieWithTmdb.mockResolvedValue(null);
    expect(
      await resolveMovie({ canonicalUrl: "https://x", title: "Nope", structured: {} }),
    ).toBeNull();
  });

  it("infers tv media_type from the themoviedb URL", async () => {
    resolveMovieWithTmdb.mockResolvedValue({
      canonical_url: "https://www.themoviedb.org/tv/1396",
      cover_url: null,
      confirmed_year: 2008,
      verified_author: null,
    });
    const patch = await resolveMovie({ canonicalUrl: "https://x", title: "Breaking Bad", structured: {} });
    expect(patch?.structured?.media_type).toBe("tv");
    expect(patch?.image_url).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/enrichment/resolvers/tmdb.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/enrichment/resolvers/tmdb.ts`:

```typescript
import "server-only";

import { resolveMovieWithTmdb } from "@/lib/recommend/resolve/tmdb";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";

/**
 * Movies/TV resolver — wraps the recommendation TMDB resolver. Requires
 * TMDB_API_KEY (handled inside resolveMovieWithTmdb, which returns null when
 * the key is absent). TMDB multi-search does not return a director, so only
 * year/image/media_type are mapped.
 */
export const resolveMovie: CategoryResolver = async (input) => {
  const title = input.title?.trim();
  if (!title) return null;

  const year = typeof input.structured.year === "number" ? input.structured.year : null;
  const resolved = await resolveMovieWithTmdb({ title, creator: null, year });
  if (!resolved) return null;

  const structured: Record<string, unknown> = {};
  if (resolved.confirmed_year !== null) structured.year = resolved.confirmed_year;
  if (resolved.canonical_url.includes("/tv/")) structured.media_type = "tv";
  else if (resolved.canonical_url.includes("/movie/")) structured.media_type = "movie";

  const patch: ResolverPatch = { source: "tmdb", structured };
  if (resolved.cover_url) patch.image_url = resolved.cover_url;
  return patch;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/enrichment/resolvers/tmdb.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/resolvers/tmdb.ts src/lib/enrichment/resolvers/tmdb.test.ts
git commit -m "feat: add TMDB movies/TV resolver wrapping the recommendation resolver"
```

---

### Task 3: Google Books resolver

**Files:**
- Create: `src/lib/enrichment/resolvers/google-books.ts`
- Create: `src/lib/enrichment/resolvers/google-books.test.ts`

Google Books API: `https://www.googleapis.com/books/v1/volumes?q=<query>` (no key). Query by ISBN when available (`isbn:<n>`), else by title.

- [ ] **Step 1: Write the failing test**

Create `src/lib/enrichment/resolvers/google-books.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveBooks } from "@/lib/enrichment/resolvers/google-books";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function volumeResponse(info: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({ items: [{ volumeInfo: info }] }),
  };
}

describe("resolveBooks", () => {
  it("returns null when there is neither isbn nor title", async () => {
    expect(await resolveBooks({ canonicalUrl: "https://x", title: null, structured: {} })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queries by ISBN and maps authors, year, page_count, image", async () => {
    fetchMock.mockResolvedValue(
      volumeResponse({
        authors: ["Frank Herbert"],
        publishedDate: "1965-08-01",
        pageCount: 412,
        imageLinks: { thumbnail: "http://books.google.com/img.jpg" },
      }),
    );

    const patch = await resolveBooks({
      canonicalUrl: "https://example.com/book",
      title: "Dune",
      structured: { isbn: "9780441013593" },
    });

    expect(fetchMock.mock.calls[0][0].toString()).toContain("isbn:9780441013593");
    expect(patch).toEqual({
      source: "google_books",
      image_url: "https://books.google.com/img.jpg",
      structured: { authors: ["Frank Herbert"], published_year: 1965, page_count: 412 },
    });
  });

  it("queries by title when no isbn and upgrades thumbnail to https", async () => {
    fetchMock.mockResolvedValue(volumeResponse({ authors: ["Andy Weir"], publishedDate: "2011" }));
    const patch = await resolveBooks({ canonicalUrl: "https://x", title: "The Martian", structured: {} });
    expect(fetchMock.mock.calls[0][0].toString()).toContain("The%20Martian");
    expect(patch?.structured).toEqual({ authors: ["Andy Weir"], published_year: 2011 });
  });

  it("returns null on non-200 or empty results", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await resolveBooks({ canonicalUrl: "https://x", title: "Dune", structured: {} })).toBeNull();

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    expect(await resolveBooks({ canonicalUrl: "https://x", title: "Dune", structured: {} })).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    expect(await resolveBooks({ canonicalUrl: "https://x", title: "Dune", structured: {} })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/enrichment/resolvers/google-books.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/enrichment/resolvers/google-books.ts`:

```typescript
import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";

const SEARCH_BASE = "https://www.googleapis.com/books/v1/volumes";
const TIMEOUT_MS = 8000;

type VolumeInfo = {
  authors?: unknown;
  publishedDate?: unknown;
  pageCount?: unknown;
  imageLinks?: { thumbnail?: unknown };
};

function year(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = value.match(/\b(\d{4})\b/);
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  return y >= 1000 && y <= 3000 ? y : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return out.length ? out : null;
}

/** Books resolver — Google Books API (no key). Query by ISBN, else by title. */
export const resolveBooks: CategoryResolver = async (input) => {
  const isbn = typeof input.structured.isbn === "string" ? input.structured.isbn.trim() : "";
  const title = input.title?.trim() ?? "";
  if (!isbn && !title) return null;

  const query = isbn ? `isbn:${isbn}` : title;
  const url = new URL(SEARCH_BASE);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "1");

  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  let info: VolumeInfo | undefined;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: Array<{ volumeInfo?: VolumeInfo }> };
    info = body.items?.[0]?.volumeInfo;
  } catch {
    return null;
  }
  if (!info) return null;

  const structured: Record<string, unknown> = {};
  const authors = stringArray(info.authors);
  if (authors) structured.authors = authors;
  const py = year(info.publishedDate);
  if (py !== null) structured.published_year = py;
  if (typeof info.pageCount === "number" && Number.isInteger(info.pageCount) && info.pageCount > 0) {
    structured.page_count = info.pageCount;
  }

  if (Object.keys(structured).length === 0) return null;

  const patch: ResolverPatch = { source: "google_books", structured };
  const thumb = info.imageLinks?.thumbnail;
  if (typeof thumb === "string" && thumb) patch.image_url = thumb.replace(/^http:/, "https:");
  return patch;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/enrichment/resolvers/google-books.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/resolvers/google-books.ts src/lib/enrichment/resolvers/google-books.test.ts
git commit -m "feat: add Google Books resolver (ISBN/title, no key)"
```

---

### Task 4: iTunes music resolver

**Files:**
- Create: `src/lib/enrichment/resolvers/itunes.ts`
- Create: `src/lib/enrichment/resolvers/itunes.test.ts`

iTunes Search API: `https://itunes.apple.com/search?term=<q>&entity=album&limit=1` (no key).

- [ ] **Step 1: Write the failing test**

Create `src/lib/enrichment/resolvers/itunes.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveMusic } from "@/lib/enrichment/resolvers/itunes";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("resolveMusic", () => {
  it("returns null without a title", async () => {
    expect(await resolveMusic({ canonicalUrl: "https://x", title: null, structured: {} })).toBeNull();
  });

  it("maps an album hit to artist, album, release_year, genre, image", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            artistName: "Radiohead",
            collectionName: "In Rainbows",
            primaryGenreName: "Alternative",
            releaseDate: "2007-10-10T07:00:00Z",
            artworkUrl100: "https://is1.mzstatic.com/100x100.jpg",
          },
        ],
      }),
    });

    const patch = await resolveMusic({ canonicalUrl: "https://x", title: "In Rainbows", structured: {} });

    expect(patch).toEqual({
      source: "itunes",
      image_url: "https://is1.mzstatic.com/600x600.jpg",
      structured: {
        artist: "Radiohead",
        album: "In Rainbows",
        release_year: 2007,
        genre: "Alternative",
      },
    });
  });

  it("returns null on empty results", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    expect(await resolveMusic({ canonicalUrl: "https://x", title: "x", structured: {} })).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("net"));
    expect(await resolveMusic({ canonicalUrl: "https://x", title: "x", structured: {} })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/enrichment/resolvers/itunes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/enrichment/resolvers/itunes.ts`:

```typescript
import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";

const SEARCH_BASE = "https://itunes.apple.com/search";
const TIMEOUT_MS = 8000;

type ItunesResult = {
  artistName?: unknown;
  collectionName?: unknown;
  primaryGenreName?: unknown;
  releaseDate?: unknown;
  artworkUrl100?: unknown;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Music resolver — iTunes Search API (no key). Looks up albums by title. */
export const resolveMusic: CategoryResolver = async (input) => {
  const title = input.title?.trim();
  if (!title) return null;

  const url = new URL(SEARCH_BASE);
  url.searchParams.set("term", title);
  url.searchParams.set("entity", "album");
  url.searchParams.set("limit", "1");

  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  let result: ItunesResult | undefined;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: ItunesResult[] };
    result = body.results?.[0];
  } catch {
    return null;
  }
  if (!result) return null;

  const structured: Record<string, unknown> = {};
  const artist = str(result.artistName);
  if (artist) structured.artist = artist;
  const album = str(result.collectionName);
  if (album) structured.album = album;
  const genre = str(result.primaryGenreName);
  if (genre) structured.genre = genre;
  const date = str(result.releaseDate);
  if (date) {
    const y = Number.parseInt(date.slice(0, 4), 10);
    if (y >= 1000 && y <= 3000) structured.release_year = y;
  }

  if (Object.keys(structured).length === 0) return null;

  const patch: ResolverPatch = { source: "itunes", structured };
  const art = str(result.artworkUrl100);
  if (art) patch.image_url = art.replace("100x100", "600x600");
  return patch;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/enrichment/resolvers/itunes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/resolvers/itunes.ts src/lib/enrichment/resolvers/itunes.test.ts
git commit -m "feat: add iTunes music resolver (no key)"
```

---

### Task 5: YouTube oEmbed video resolver

**Files:**
- Create: `src/lib/enrichment/resolvers/youtube-oembed.ts`
- Create: `src/lib/enrichment/resolvers/youtube-oembed.test.ts`

oEmbed: `https://www.youtube.com/oembed?url=<videoUrl>&format=json` (no key). Only acts on youtube.com / youtu.be URLs.

- [ ] **Step 1: Write the failing test**

Create `src/lib/enrichment/resolvers/youtube-oembed.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveVideo } from "@/lib/enrichment/resolvers/youtube-oembed";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("resolveVideo", () => {
  it("ignores non-YouTube URLs", async () => {
    expect(
      await resolveVideo({ canonicalUrl: "https://vimeo.com/123", title: null, structured: {} }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a youtube.com hit to title, channel, thumbnail", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        title: "Never Gonna Give You Up",
        author_name: "Rick Astley",
        thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      }),
    });

    const patch = await resolveVideo({
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: null,
      structured: {},
    });

    expect(patch).toEqual({
      source: "youtube_oembed",
      title: "Never Gonna Give You Up",
      image_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      structured: { channel: "Rick Astley" },
    });
  });

  it("acts on youtu.be short links", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ title: "X", author_name: "Y", thumbnail_url: "https://t.jpg" }),
    });
    const patch = await resolveVideo({ canonicalUrl: "https://youtu.be/abc", title: null, structured: {} });
    expect(patch?.source).toBe("youtube_oembed");
  });

  it("returns null on non-200", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(
      await resolveVideo({ canonicalUrl: "https://www.youtube.com/watch?v=x", title: null, structured: {} }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/enrichment/resolvers/youtube-oembed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/enrichment/resolvers/youtube-oembed.ts`:

```typescript
import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";

const OEMBED_BASE = "https://www.youtube.com/oembed";
const TIMEOUT_MS = 8000;

function isYouTube(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  } catch {
    return false;
  }
}

/** Videos resolver — YouTube oEmbed (no key). Title, channel, thumbnail. */
export const resolveVideo: CategoryResolver = async (input) => {
  if (!isYouTube(input.canonicalUrl)) return null;

  const url = new URL(OEMBED_BASE);
  url.searchParams.set("url", input.canonicalUrl);
  url.searchParams.set("format", "json");

  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  let body: { title?: unknown; author_name?: unknown; thumbnail_url?: unknown };
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    body = (await res.json()) as typeof body;
  } catch {
    return null;
  }

  const patch: ResolverPatch = { source: "youtube_oembed" };
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.author_name === "string" && body.author_name.trim()) {
    patch.structured = { channel: body.author_name.trim() };
  }
  if (typeof body.thumbnail_url === "string" && body.thumbnail_url) patch.image_url = body.thumbnail_url;

  if (!patch.title && !patch.image_url && !patch.structured) return null;
  return patch;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/enrichment/resolvers/youtube-oembed.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/resolvers/youtube-oembed.ts src/lib/enrichment/resolvers/youtube-oembed.test.ts
git commit -m "feat: add YouTube oEmbed video resolver (no key)"
```

---

### Task 6: GitHub apps resolver

**Files:**
- Create: `src/lib/enrichment/resolvers/github.ts`
- Create: `src/lib/enrichment/resolvers/github.test.ts`

GitHub REST: `https://api.github.com/repos/<owner>/<repo>` (no key; 60 req/hr/IP). Only acts on github.com repo URLs.

- [ ] **Step 1: Write the failing test**

Create `src/lib/enrichment/resolvers/github.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveApp } from "@/lib/enrichment/resolvers/github";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("resolveApp", () => {
  it("ignores non-repo GitHub URLs and non-GitHub URLs", async () => {
    expect(await resolveApp({ canonicalUrl: "https://github.com/explore", title: null, structured: {} })).toBeNull();
    expect(await resolveApp({ canonicalUrl: "https://gitlab.com/a/b", title: null, structured: {} })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a repo to developer, description, language, owner avatar", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        description: "A fast bundler",
        language: "Rust",
        owner: { login: "vercel", avatar_url: "https://avatars.githubusercontent.com/u/1.png" },
      }),
    });

    const patch = await resolveApp({
      canonicalUrl: "https://github.com/vercel/turbo",
      title: null,
      structured: {},
    });

    expect(fetchMock.mock.calls[0][0].toString()).toBe("https://api.github.com/repos/vercel/turbo");
    expect(patch).toEqual({
      source: "github",
      description: "A fast bundler",
      image_url: "https://avatars.githubusercontent.com/u/1.png",
      structured: { developer: "vercel", category_tag: "Rust" },
    });
  });

  it("returns null on 403/429 rate limit or fetch error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    expect(await resolveApp({ canonicalUrl: "https://github.com/a/b", title: null, structured: {} })).toBeNull();
    fetchMock.mockRejectedValue(new Error("net"));
    expect(await resolveApp({ canonicalUrl: "https://github.com/a/b", title: null, structured: {} })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/enrichment/resolvers/github.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/enrichment/resolvers/github.ts`:

```typescript
import "server-only";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";
import type { CategoryResolver, ResolverPatch } from "@/lib/enrichment/resolvers/types";

const TIMEOUT_MS = 8000;
const REPO_RE = /^\/([^/]+)\/([^/]+)\/?$/;

function parseRepo(url: string): { owner: string; repo: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase().replace(/^www\./, "") !== "github.com") return null;
  const m = parsed.pathname.match(REPO_RE);
  if (!m) return null;
  // Exclude reserved owner paths that look like repos.
  if (["explore", "topics", "trending", "marketplace", "sponsors"].includes(m[1].toLowerCase())) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

/** Apps resolver — GitHub REST API (no key, 60/hr/IP). Repo owner, description, language. */
export const resolveApp: CategoryResolver = async (input) => {
  const repo = parseRepo(input.canonicalUrl);
  if (!repo) return null;

  const url = new URL(`https://api.github.com/repos/${repo.owner}/${repo.repo}`);
  try {
    await assertSafeFetchUrl(url);
  } catch {
    return null;
  }

  let body: { description?: unknown; language?: unknown; owner?: { login?: unknown; avatar_url?: unknown } };
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    body = (await res.json()) as typeof body;
  } catch {
    return null;
  }

  const structured: Record<string, unknown> = {};
  if (typeof body.owner?.login === "string" && body.owner.login.trim()) {
    structured.developer = body.owner.login.trim();
  }
  if (typeof body.language === "string" && body.language.trim()) {
    structured.category_tag = body.language.trim();
  }

  const patch: ResolverPatch = { source: "github" };
  if (Object.keys(structured).length) patch.structured = structured;
  if (typeof body.description === "string" && body.description.trim()) {
    patch.description = body.description.trim();
  }
  if (typeof body.owner?.avatar_url === "string" && body.owner.avatar_url) {
    patch.image_url = body.owner.avatar_url;
  }

  if (!patch.structured && !patch.description && !patch.image_url) return null;
  return patch;
};
```

- [ ] **Step 4: Run to verify it passes; then full type check**

Run: `npx vitest run src/lib/enrichment/resolvers/; npx tsc --noEmit`
Expected: all resolver tests PASS; `tsc` clean (the registry's imports of all five modules now resolve).

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/resolvers/github.ts src/lib/enrichment/resolvers/github.test.ts
git commit -m "feat: add GitHub apps resolver (no key)"
```

---

### Task 7: Integrate the registry into `enrichItem`  ⚠️ SHARED FILE

**Files:**
- Modify: `src/lib/jobs/enrich-item.ts`

This is the only Phase 3 task that edits a file Phase 2 also edits. See the parallel-execution section before running this concurrently with Phase 2.

The resolver runs **after** classification and the `merged*` declarations, **before** the `fetchBlocked` / eligibility decision, so resolver-filled fields make the LLM eligibility see richer data. It fills only missing/sparse fields (deterministic source ranked above the later LLM merge).

- [ ] **Step 1: Add a sparse-fields helper + import**

Add the import near the other enrichment imports in `src/lib/jobs/enrich-item.ts`:

```typescript
import { resolveCategoryEvidence } from "@/lib/enrichment/resolvers/index";
```

Add this module-level helper (mirrors the eligibility "important fields" notion; kept local to avoid editing `eligibility.ts`, which Phase 2 modifies):

```typescript
const RESOLVER_IMPORTANT_FIELDS: Partial<Record<ItemCategory, string[]>> = {
  movies_and_tv: ["year", "directors"],
  books: ["authors", "published_year"],
  music: ["artist", "album"],
  videos: ["channel"],
  apps: ["developer"],
};

function resolverFieldsSparse(
  category: ItemCategory | null,
  structured: Record<string, unknown>,
): boolean {
  if (!category) return false;
  const fields = RESOLVER_IMPORTANT_FIELDS[category];
  if (!fields) return false;
  const filled = fields.filter((f) => hasUsefulValue(structured[f])).length;
  return filled < fields.length;
}
```

- [ ] **Step 2: Insert the resolver hook**

In `enrichItem`, immediately AFTER the block that declares `let mergedCategorySource = classification.category_source;` and BEFORE `const fetchBlocked = ...`, insert:

```typescript
    // Phase 3: free deterministic API resolvers. Only when important fields are
    // still sparse; fills missing fields and ranks above any later LLM merge.
    if (resolverFieldsSparse(mergedCategory, mergedStructured)) {
      const patch = await resolveCategoryEvidence(mergedCategory, {
        canonicalUrl: fetchResult.finalUrl,
        title: mergedTitle,
        structured: mergedStructured,
      });
      if (patch) {
        if (patch.structured) {
          for (const [key, value] of Object.entries(patch.structured)) {
            if (value !== undefined && value !== null && !hasUsefulValue(mergedStructured[key])) {
              mergedStructured[key] = value;
            }
          }
        }
        if (patch.title && isWeakTitle(mergedTitle)) mergedTitle = patch.title;
        if (patch.description && !mergedDescription?.trim()) mergedDescription = patch.description;
        if (patch.image_url && !mergedImageUrl) mergedImageUrl = patch.image_url;
        mergedRawMetadata = {
          ...mergedRawMetadata,
          resolver: { source: patch.source, fields: Object.keys(patch.structured ?? {}) },
        };
      }
    }
```

(`hasUsefulValue` and `isWeakTitle` are already imported/defined in this file.)

- [ ] **Step 3: Type check + full suite**

Run: `npx tsc --noEmit; npm test`
Expected: clean; all green. The resolver only fires on sparse fields, so existing enrich behavior for clean pages is unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/lib/jobs/enrich-item.ts
git commit -m "feat: run free category resolvers before LLM enrichment"
```

---

### Task 8: Env, docs, and final verification  ⚠️ SHARED DOCS

**Files:**
- Modify: `.env.local.example`
- Modify: `docs/qa-checklist.md`
- Modify: `AGENTS.md` (resolver mention)

- [ ] **Step 1: Document TMDB for enrichment**

In `.env.local.example`, the `TMDB_API_KEY` line already exists (commented, under recommendations). Update its comment to note it now also powers movies/TV enrichment:

```bash
# TMDB_API_KEY=                               # https://www.themoviedb.org/settings/api
#   Powers F2 watch recommendations AND the movies/TV enrichment resolver.
#   Other enrichment resolvers (Google Books, iTunes, YouTube oEmbed, GitHub) need no key.
```

- [ ] **Step 2: Add resolver QA rows**

Append to the URL matrix in `docs/qa-checklist.md`:

```markdown
## Category resolvers (phase 3, free APIs)

| URL | Category | Expected |
|-----|----------|----------|
| Bare youtube.com/watch URL | videos | `channel` + thumbnail filled from oEmbed; no LLM call needed |
| github.com/owner/repo | apps | `developer` + `category_tag` (language) + description; `raw_metadata.resolver.source = "github"` |
| Apple Music / album page | music | `artist`, `album`, `release_year`, `genre` from iTunes |
| Book page that isn't an Open Library work | books | `authors`/`published_year` from Google Books |
| IMDb/TMDb movie with sparse OG (needs TMDB_API_KEY) | movies_and_tv | `year` + poster from TMDB |
```

- [ ] **Step 3: Note resolvers in AGENTS.md**

In `AGENTS.md`, under the enrichment description, add one line near the `src/lib/enrichment/` map entry or working conventions:

```markdown
- Free category resolvers live in `src/lib/enrichment/resolvers/` (TMDB, Google Books, iTunes, YouTube oEmbed, GitHub); they run after classify when important fields are sparse and rank above LLM output. Add a new source by adding a `CategoryResolver` and registering it in `resolvers/index.ts`.
```

- [ ] **Step 4: Full verification**

Run: `npm test; npm run build`
Expected: all green; clean build.

- [ ] **Step 5: Commit**

```bash
git add .env.local.example docs/qa-checklist.md AGENTS.md
git commit -m "docs: document free category resolvers and TMDB enrichment use"
```

---

## Parallel execution with Phase 2

- **Tasks 1–6 (all resolver modules + tests)** create only NEW files under `src/lib/enrichment/resolvers/`. Zero overlap with Phase 2. Fully parallel-safe.
- **Task 7** edits the shared `src/lib/jobs/enrich-item.ts`. Insertion point: right after the `merged*` declarations, before `fetchBlocked`. Phase 2 edits this same file in the evidence-gathering region (top of the `try`) and the eligibility/LLM-call region (below `fetchBlocked`). The two insertions are in different regions but close enough that a naive merge may conflict.
- **Task 8** edits shared docs (`.env.local.example`, `docs/qa-checklist.md`, `AGENTS.md`) — Phase 2 appends different sections to the same files (append-only conflicts are trivial to resolve).

**Recommendation:** land Phase 3 first (purely additive, deterministic, lower risk), then have the Phase 2 session rebase its `enrich-item.ts` hook on top. See the verdict in the Phase 2 plan's "Parallel execution" section.

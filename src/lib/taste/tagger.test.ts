// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ generateJsonWithFallback: vi.fn() }));
vi.mock("@/lib/ai/gateway", () => ({ generateJsonWithFallback: mocks.generateJsonWithFallback }));

import {
  TAGGER_RESPONSE_SCHEMA,
  buildTaggerPrompt,
  needsLlmGenres,
  parseTaggerOutput,
  tagItems,
  taggerInputFromItem,
  type TaggerInput,
} from "./tagger";

const book = (over: Partial<TaggerInput> = {}): TaggerInput => ({
  id: "b1",
  category: "books",
  title: "Piranesi",
  creator: "Susanna Clarke",
  year: 2020,
  rawGenres: [],
  description: "A man lives in a house of endless halls.",
  ...over,
});
const film = (over: Partial<TaggerInput> = {}): TaggerInput => ({
  id: "f1",
  category: "movies_and_tv",
  title: "Hereditary",
  creator: "Ari Aster",
  year: 2018,
  rawGenres: ["Horror", "Mystery"],
  description: null,
  ...over,
});

describe("taggerInputFromItem", () => {
  it("reads authors and published_year for a book", () => {
    const input = taggerInputFromItem({
      id: "b1",
      category: "books",
      title: " Piranesi ",
      description: " Halls. ",
      structured: { authors: ["Susanna Clarke"], published_year: 2020, genres: ["Fantasy"] },
    });
    expect(input).toEqual({
      id: "b1",
      category: "books",
      title: "Piranesi",
      creator: "Susanna Clarke",
      year: 2020,
      rawGenres: ["Fantasy"],
      description: "Halls.",
    });
  });

  it("reads directors and year for a film", () => {
    const input = taggerInputFromItem({
      id: "f1",
      category: "movies_and_tv",
      title: "Hereditary",
      description: null,
      structured: { directors: ["Ari Aster"], year: 2018 },
    });
    expect(input).toMatchObject({ creator: "Ari Aster", year: 2018, description: null });
  });

  it("returns null for other categories and for a missing title", () => {
    expect(
      taggerInputFromItem({ id: "a", category: "articles", title: "x", description: null, structured: {} }),
    ).toBeNull();
    expect(
      taggerInputFromItem({ id: "a", category: "books", title: " ", description: null, structured: {} }),
    ).toBeNull();
  });
});

describe("needsLlmGenres", () => {
  it("is true for a book without a deterministic key", () => {
    expect(needsLlmGenres(book())).toBe(true);
    expect(needsLlmGenres(book({ rawGenres: ["Fiction"] }))).toBe(true);
  });
  it("is false for a book with a key and for a film", () => {
    expect(needsLlmGenres(book({ rawGenres: ["Fantasy"] }))).toBe(false);
    expect(needsLlmGenres(film())).toBe(false);
  });
});

describe("buildTaggerPrompt", () => {
  it("defines every mood and cuts the description to 600 characters", () => {
    const prompt = buildTaggerPrompt([book({ description: "word ".repeat(300) })]);
    for (const mood of ["cozy", "eerie", "slow-burn", "thought-provoking"]) {
      expect(prompt).toContain(`- ${mood}:`);
    }
    const line = prompt.split("\n").find((l) => l.startsWith('{"id":"b1"'));
    const parsed = JSON.parse(line as string) as { description: string; pick_genre_keys: boolean };
    expect(parsed.description.length).toBeLessThanOrEqual(601);
    expect(parsed.pick_genre_keys).toBe(true);
  });

  it("never mentions note or verdict", () => {
    const prompt = buildTaggerPrompt([book(), film()]);
    expect(prompt).not.toMatch(/\bnote\b|\bverdict\b/i);
  });
});

describe("parseTaggerOutput", () => {
  it("keeps valid keys, drops unknown keys, and caps each list at 3", () => {
    const out = parseTaggerOutput(
      {
        items: [
          {
            id: "b1",
            mood_keys: ["eerie", "bogus", "dark", "eerie", "tense", "epic"],
            genre_keys: ["fantasy", "nope", "literary", "scifi", "horror"],
          },
        ],
      },
      [book()],
    );
    expect(out).toEqual([
      { id: "b1", mood_keys: ["eerie", "dark", "tense"], genre_keys: ["fantasy", "literary", "scifi"] },
    ]);
  });

  it("drops unknown ids and duplicate ids", () => {
    const out = parseTaggerOutput(
      {
        items: [
          { id: "zzz", mood_keys: ["cozy"], genre_keys: [] },
          { id: "f1", mood_keys: ["tense"], genre_keys: [] },
          { id: "f1", mood_keys: ["dark"], genre_keys: [] },
        ],
      },
      [film()],
    );
    expect(out).toEqual([{ id: "f1", mood_keys: ["tense"], genre_keys: [] }]);
  });

  it("drops genre keys for an item that did not ask for them", () => {
    const out = parseTaggerOutput(
      { items: [{ id: "f1", mood_keys: [], genre_keys: ["fantasy"] }] },
      [film()],
    );
    expect(out[0].genre_keys).toEqual([]);
  });

  it("returns an empty list for a bad payload", () => {
    expect(parseTaggerOutput(null, [book()])).toEqual([]);
    expect(parseTaggerOutput({ items: "x" }, [book()])).toEqual([]);
  });
});

describe("tagItems", () => {
  beforeEach(() => mocks.generateJsonWithFallback.mockReset());

  it("calls the gateway with the schema and parses the result", async () => {
    mocks.generateJsonWithFallback.mockResolvedValue({
      model: "m",
      data: { items: [{ id: "f1", mood_keys: ["eerie"], genre_keys: [] }] },
    });
    const out = await tagItems([film()]);
    expect(out).toEqual([{ id: "f1", mood_keys: ["eerie"], genre_keys: [] }]);
    expect(mocks.generateJsonWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ schema: TAGGER_RESPONSE_SCHEMA, label: "taste-tag" }),
    );
  });

  it("rejects a batch of more than 10 and skips the call for an empty batch", async () => {
    await expect(tagItems(Array.from({ length: 11 }, (_, i) => film({ id: `f${i}` })))).rejects.toThrow();
    expect(await tagItems([])).toEqual([]);
    expect(mocks.generateJsonWithFallback).not.toHaveBeenCalled();
  });
});

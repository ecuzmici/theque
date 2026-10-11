// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  bookGenreChange,
  buildApplyPlan,
  buildGenreKeyProposal,
  chunk,
  mergeTagResult,
  needsBookGenres,
  parseBackfillArgs,
  parseProposal,
  summarizeProposal,
  type BackfillItemRow,
  type BackupRow,
  type ProposalRow,
} from "./backfill";

const row = (over: Partial<BackfillItemRow> = {}): BackfillItemRow => ({
  id: "i1",
  category: "books",
  title: "Piranesi",
  description: null,
  structured: {},
  genre_keys: [],
  mood_keys: [],
  taste_tagged_at: null,
  ...over,
});

describe("buildGenreKeyProposal", () => {
  it("sets keys from structured.genres and skips rows with no change", () => {
    const proposal = buildGenreKeyProposal([
      row({ id: "a", structured: { genres: ["Fantasy", "Horror"] } }),
      row({ id: "b", structured: { genres: ["Fantasy"] }, genre_keys: ["fantasy"] }),
      row({ id: "c", structured: { genres: ["Fiction"] } }),
      row({ id: "d", category: "articles", structured: { genres: ["Horror"] } }),
      row({ id: "e", category: "movies_and_tv", structured: { genres: ["Drama", "Horror"] } }),
    ]);
    expect(proposal.map((p) => p.id)).toEqual(["a", "e"]);
    expect(proposal[0].after).toEqual({ genre_keys: ["fantasy", "horror"] });
    expect(proposal[1].after).toEqual({ genre_keys: ["horror"] });
  });

  it("keeps stored keys when the genres map to nothing", () => {
    expect(
      buildGenreKeyProposal([row({ structured: { genres: ["Fiction"] }, genre_keys: ["horror"] })]),
    ).toEqual([]);
  });
});

describe("bookGenreChange", () => {
  it("merges genres and derives keys", () => {
    const change = bookGenreChange(row(), ["Fantasy", "Fiction"]);
    expect(change?.after).toEqual({ structured: { genres: ["Fantasy", "Fiction"] }, genre_keys: ["fantasy"] });
    expect(change?.before).toEqual({ structured: { genres: null }, genre_keys: [] });
  });

  it("sets genres without keys when none map", () => {
    const change = bookGenreChange(row(), ["Fiction"]);
    expect(change?.after).toEqual({ structured: { genres: ["Fiction"] } });
  });

  it("returns null with no found genres, for a book that has genres, or for a film", () => {
    expect(bookGenreChange(row(), [])).toBeNull();
    expect(bookGenreChange(row({ structured: { genres: ["Horror"] } }), ["Fantasy"])).toBeNull();
    expect(bookGenreChange(row({ category: "movies_and_tv" }), ["Fantasy"])).toBeNull();
  });

  it("replaces saved genres with replace", () => {
    const saved = row({ structured: { genres: ["Fantasy", "Science Fiction"] }, genre_keys: ["fantasy", "scifi"] });
    const change = bookGenreChange(saved, ["Fantasy"], { replace: true });
    expect(change?.before).toEqual({ structured: { genres: ["Fantasy", "Science Fiction"] }, genre_keys: ["fantasy", "scifi"] });
    expect(change?.after).toEqual({ structured: { genres: ["Fantasy"] }, genre_keys: ["fantasy"] });
  });

  it("returns null with replace when the genres are the same", () => {
    const saved = row({ structured: { genres: ["Fantasy"] }, genre_keys: ["fantasy"] });
    expect(bookGenreChange(saved, ["Fantasy"], { replace: true })).toBeNull();
  });
});

describe("needsBookGenres", () => {
  it("is true for a book with empty or missing genres", () => {
    expect(needsBookGenres(row())).toBe(true);
    expect(needsBookGenres(row({ structured: { genres: [] } }))).toBe(true);
    expect(needsBookGenres(row({ structured: { genres: ["Horror"] } }))).toBe(false);
    expect(needsBookGenres(row({ category: "movies_and_tv" }))).toBe(false);
  });
});

describe("mergeTagResult", () => {
  const at = "2026-10-11T12:00:00.000Z";

  it("takes LLM genres only when the item has no genre key", () => {
    const result = { id: "i1", mood_keys: ["eerie" as const], genre_keys: ["fantasy" as const] };
    expect(mergeTagResult(row(), null, result, at).after).toEqual({
      mood_keys: ["eerie"],
      taste_tagged_at: at,
      genre_keys: ["fantasy"],
    });
    const withKey = row({ structured: { genres: ["Horror"] } });
    const phase1 = buildGenreKeyProposal([withKey])[0];
    expect(mergeTagResult(withKey, phase1, result, at).after).toEqual({
      mood_keys: ["eerie"],
      taste_tagged_at: at,
      genre_keys: ["horror"],
    });
  });

  it("keeps stored genre keys and leaves genre_keys out of the change", () => {
    const stored = row({ genre_keys: ["thriller"] });
    const result = { id: "i1", mood_keys: [], genre_keys: ["fantasy" as const] };
    const merged = mergeTagResult(stored, null, result, at);
    expect(merged.after).toEqual({ mood_keys: [], taste_tagged_at: at });
    expect(merged.before).toEqual({ mood_keys: [], taste_tagged_at: null });
  });
});

describe("summarizeProposal", () => {
  it("counts keys per row and builds histograms", () => {
    const proposal: ProposalRow[] = [
      { id: "a", title: null, before: {}, after: { genre_keys: ["horror"], mood_keys: ["eerie", "dark"] } },
      { id: "b", title: null, before: {}, after: { mood_keys: ["eerie"] } },
    ];
    expect(summarizeProposal(proposal)).toEqual({
      rows: 2,
      keysPerRow: { min: 1, max: 3, mean: 2 },
      genreHistogram: { horror: 1 },
      moodHistogram: { eerie: 2, dark: 1 },
    });
    expect(summarizeProposal([]).keysPerRow).toEqual({ min: 0, max: 0, mean: 0 });
  });
});

describe("parseProposal", () => {
  it("accepts a valid proposal", () => {
    const parsed = parseProposal([{ id: "a", title: "T", before: {}, after: { genre_keys: ["horror"] } }]);
    expect(parsed[0].id).toBe("a");
  });

  it.each([
    ["not an array", {}],
    ["no id", [{ before: {}, after: { genre_keys: [] } }]],
    ["empty after", [{ id: "a", before: {}, after: {} }]],
    ["unknown field", [{ id: "a", before: {}, after: { title: "x" } }]],
    ["duplicate id", [
      { id: "a", before: {}, after: { genre_keys: [] } },
      { id: "a", before: {}, after: { genre_keys: [] } },
    ]],
    ["bad mood_keys", [{ id: "a", before: {}, after: { mood_keys: "x" } }]],
  ])("rejects %s", (_name, input) => {
    expect(() => parseProposal(input)).toThrow();
  });
});

describe("buildApplyPlan", () => {
  const current = (over: Partial<BackupRow> = {}): BackupRow => ({
    id: "i1",
    structured: { authors: ["A"] },
    genre_keys: [],
    mood_keys: [],
    taste_tagged_at: null,
    ...over,
  });

  it("builds a patch, merges structured keys, and backs up the current row", () => {
    const proposal: ProposalRow[] = [
      {
        id: "i1",
        title: null,
        before: { structured: { genres: null }, genre_keys: [] },
        after: { structured: { genres: ["Fantasy"] }, genre_keys: ["fantasy"] },
      },
    ];
    const plan = buildApplyPlan(proposal, [current()]);
    expect(plan.writes).toEqual([
      {
        id: "i1",
        patch: { structured: { authors: ["A"], genres: ["Fantasy"] }, genre_keys: ["fantasy"] },
      },
    ]);
    expect(plan.backups).toEqual([current()]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips a missing row and a row that changed since the dry run", () => {
    const proposal: ProposalRow[] = [
      { id: "gone", title: null, before: { mood_keys: [] }, after: { mood_keys: ["cozy"] } },
      { id: "i1", title: null, before: { mood_keys: [] }, after: { mood_keys: ["cozy"] } },
    ];
    const plan = buildApplyPlan(proposal, [current({ mood_keys: ["dark"] })]);
    expect(plan.writes).toEqual([]);
    expect(plan.backups).toEqual([]);
    expect(plan.skipped.map((s) => s.id)).toEqual(["gone", "i1"]);
  });

  it("treats null and an empty array as equal when it compares", () => {
    const proposal: ProposalRow[] = [
      { id: "i1", title: null, before: { structured: { genres: null } }, after: { structured: { genres: ["Horror"] } } },
    ];
    const plan = buildApplyPlan(proposal, [current({ structured: { genres: [] } })]);
    expect(plan.writes).toHaveLength(1);
  });
});

describe("parseBackfillArgs", () => {
  it("uses the defaults", () => {
    expect(parseBackfillArgs([])).toEqual({
      apply: false,
      from: null,
      outDir: ".backfill",
      limit: null,
      maxCalls: 40,
      refreshFrom: null,
    });
  });

  it("reads both option forms", () => {
    const args = parseBackfillArgs(["--limit", "10", "--max-calls=1", "--out-dir", "/tmp/x"]);
    expect(args).toMatchObject({ limit: 10, maxCalls: 1, outDir: "/tmp/x" });
  });

  it("needs --from with --apply and rejects --from without --apply", () => {
    expect(() => parseBackfillArgs(["--apply"])).toThrow();
    expect(() => parseBackfillArgs(["--from", "p.json"])).toThrow();
    expect(parseBackfillArgs(["--apply", "--from", "p.json"])).toMatchObject({ apply: true, from: "p.json" });
  });

  it("reads --refresh-from only in a dry run", () => {
    expect(parseBackfillArgs(["--refresh-from", "b.json"])).toMatchObject({ refreshFrom: "b.json" });
    expect(() => parseBackfillArgs(["--apply", "--from", "p.json", "--refresh-from", "b.json"])).toThrow();
  });

  it("rejects a bad count", () => {
    expect(() => parseBackfillArgs(["--limit", "0"])).toThrow();
    expect(() => parseBackfillArgs(["--max-calls", "abc"])).toThrow();
  });
});

describe("chunk", () => {
  it("splits a list", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

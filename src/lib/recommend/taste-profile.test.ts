import { describe, expect, it } from "vitest";

import { buildTasteProfile, filterNeverTitles } from "@/lib/recommend/taste-profile";
import type { LibraryItemRow } from "@/lib/recommend/taste-profile";

function item(overrides: Partial<LibraryItemRow> & { title: string }): LibraryItemRow {
  return {
    status: "want",
    rating_personal: null,
    verdict: null,
    structured: { authors: ["Author"], published_year: 2020 },
    category: "books",
    ...overrides,
  };
}

describe("buildTasteProfile", () => {
  it("places 4–5★ done items in loved, highest rating first", () => {
    const profile = buildTasteProfile(
      [
        item({ title: "Four Star", status: "done", rating_personal: 4 }),
        item({ title: "Five Star", status: "done", rating_personal: 5 }),
      ],
      [],
    );
    expect(profile.loved.map((i) => i.title)).toEqual(["Five Star", "Four Star"]);
  });

  it("places 1–2★ done items in disliked (max 3)", () => {
    const profile = buildTasteProfile(
      [
        item({ title: "Bad One", status: "done", rating_personal: 1 }),
        item({ title: "Bad Two", status: "done", rating_personal: 2 }),
        item({ title: "Bad Three", status: "done", rating_personal: 2 }),
        item({ title: "Bad Four", status: "done", rating_personal: 1 }),
      ],
      [],
    );
    expect(profile.disliked).toHaveLength(3);
  });

  it("fills backlog from want items without rating", () => {
    const profile = buildTasteProfile(
      [
        item({ title: "Backlog A" }),
        item({ title: "Backlog B" }),
        item({ title: "Done Five", status: "done", rating_personal: 5 }),
      ],
      [],
    );
    expect(profile.backlog.map((i) => i.title)).toEqual(["Backlog A", "Backlog B"]);
  });

  it("puts empty-structured titles in never", () => {
    const profile = buildTasteProfile(
      [item({ title: "Sparse Book", structured: {} })],
      [],
    );
    expect(profile.never).toContain("Sparse Book");
    expect(profile.backlog).toHaveLength(0);
  });

  it("includes suppressed outcome titles in never", () => {
    const profile = buildTasteProfile([], ["dismissed pick"]);
    expect(profile.never).toContain("dismissed pick");
  });

  it("does not put loved/disliked items in never", () => {
    const profile = buildTasteProfile(
      [
        item({ title: "Great Book", status: "done", rating_personal: 5 }),
        item({ title: "Bad Book", status: "done", rating_personal: 1 }),
      ],
      [],
    );
    expect(profile.never).not.toContain("Great Book");
    expect(profile.never).not.toContain("Bad Book");
    expect(profile.loved.map((i) => i.title)).toContain("Great Book");
    expect(profile.disliked.map((i) => i.title)).toContain("Bad Book");
  });

  it("truncates verdict notes to ~200 chars", () => {
    const longNote = "x".repeat(250);
    const profile = buildTasteProfile(
      [item({ title: "Rated", status: "done", rating_personal: 5, verdict: longNote })],
      [],
    );
    expect(profile.loved[0].verdictNote).toHaveLength(200);
    expect(profile.loved[0].verdictNote!.endsWith("…")).toBe(true);
  });
});

describe("filterNeverTitles", () => {
  it("removes cards matching never titles (normalized)", () => {
    const cards = [{ title: "The Gone World" }, { title: "Piranesi" }];
    const filtered = filterNeverTitles(cards, ["gone world"]);
    expect(filtered.map((c) => c.title)).toEqual(["Piranesi"]);
  });
});

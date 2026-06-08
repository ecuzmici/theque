import { describe, expect, it } from "vitest";

import { normalizeTitle, dedupRecommendations } from "@/lib/recommend/dedup";
import type { ResolvedRecommendation } from "@/lib/recommend/recommend-types";

function makeCard(title: string): ResolvedRecommendation {
  return {
    id: `id-${title}`,
    title,
    subtitle: "Author · 2020",
    description: "A description",
    reason: "A reason",
    canonical_url: `https://openlibrary.org/works/OL${title}W`,
    cover_url: null,
    search_query: `${title} book`,
    source: "open_library",
  };
}

describe("normalizeTitle", () => {
  it("lowercases the title", () => {
    expect(normalizeTitle("PIRANESI")).toBe("piranesi");
  });

  it("strips diacritics", () => {
    expect(normalizeTitle("Café")).toBe("cafe");
  });

  it("strips punctuation", () => {
    // The & is replaced with space and then whitespace is collapsed
    expect(normalizeTitle("Jonathan Strange & Mr Norrell")).toBe(
      "jonathan strange mr norrell",
    );
  });

  it("strips leading 'the'", () => {
    expect(normalizeTitle("The Name of the Wind")).toBe("name of the wind");
  });

  it("strips leading 'a'", () => {
    expect(normalizeTitle("A Brief History of Time")).toBe("brief history of time");
  });

  it("strips leading 'an'", () => {
    expect(normalizeTitle("An American Marriage")).toBe("american marriage");
  });

  it("handles extra whitespace", () => {
    expect(normalizeTitle("  Piranesi  ")).toBe("piranesi");
  });
});

describe("dedupRecommendations", () => {
  it("removes cards matching existing titles (case-insensitive)", () => {
    const cards = [
      makeCard("Piranesi"),
      makeCard("The Midnight Library"),
      makeCard("Klara and the Sun"),
    ];
    const existing = ["piranesi", "Some Other Book"];
    const result = dedupRecommendations(cards, existing);
    expect(result.map((c) => c.title)).toEqual(["The Midnight Library", "Klara and the Sun"]);
  });

  it("removes cards when existing title differs only by leading article", () => {
    const cards = [makeCard("The Name of the Wind"), makeCard("Piranesi")];
    const existing = ["Name of the Wind"];
    const result = dedupRecommendations(cards, existing);
    expect(result.map((c) => c.title)).toEqual(["Piranesi"]);
  });

  it("passes through cards with no matching existing title", () => {
    const cards = [
      makeCard("Piranesi"),
      makeCard("The Midnight Library"),
    ];
    const result = dedupRecommendations(cards, ["Klara and the Sun"]);
    expect(result).toHaveLength(2);
  });

  it("handles empty existing titles gracefully", () => {
    const cards = [makeCard("Piranesi"), makeCard("Klara and the Sun")];
    const result = dedupRecommendations(cards, []);
    expect(result).toHaveLength(2);
  });

  it("handles null existing titles (nullable DB values)", () => {
    const cards = [makeCard("Piranesi")];
    const result = dedupRecommendations(cards, [null, null]);
    expect(result).toHaveLength(1);
  });
});

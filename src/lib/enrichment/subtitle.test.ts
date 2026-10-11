import { describe, expect, it } from "vitest";

import { buildSubtitle, chooseSubtitle } from "@/lib/enrichment/subtitle";

describe("buildSubtitle", () => {
  it("builds Director · Year for movies", () => {
    expect(buildSubtitle("movies_and_tv", { directors: ["Ron Underwood"], year: 1990 })).toBe(
      "Ron Underwood · 1990",
    );
  });

  it("builds Author · Year for books", () => {
    expect(buildSubtitle("books", { authors: ["Vernor Vinge"], published_year: 1992 })).toBe(
      "Vernor Vinge · 1992",
    );
  });

  it("returns null for other categories", () => {
    expect(buildSubtitle("articles", { year: 2020 })).toBeNull();
  });
});

describe("chooseSubtitle", () => {
  it("prefers the structured byline for movies over a page subtitle", () => {
    expect(
      chooseSubtitle("movies_and_tv", { directors: ["Kiyoshi Kurosawa"], year: 1997 }, "Kiyoshi Kurosawa, 1997"),
    ).toBe("Kiyoshi Kurosawa · 1997");
  });

  it("prefers the structured byline for books", () => {
    expect(chooseSubtitle("books", { authors: ["Liu Cixin"] }, "by Liu Cixin (2008)")).toBe("Liu Cixin");
  });

  it("falls back to the page subtitle when the structured fields are empty", () => {
    expect(chooseSubtitle("movies_and_tv", {}, "Ridley Scott - 2026")).toBe("Ridley Scott - 2026");
  });

  it("keeps the page subtitle first for other categories", () => {
    expect(chooseSubtitle("articles", {}, "By Jane Doe")).toBe("By Jane Doe");
    expect(chooseSubtitle("recipes", {}, null)).toBeNull();
  });
});

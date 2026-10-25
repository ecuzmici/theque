import { describe, expect, it } from "vitest";

import {
  cardByline,
  cardTitle,
  coverStatusLabel,
  coverTint,
  expectsLandscape,
  isDarkTint,
} from "./ItemCardCover";

describe("cardTitle", () => {
  it("cleans leaked IMDb text", () => {
    expect(cardTitle({ title: "Tremors (1990) - IMDb", domain: "imdb.com" })).toBe("Tremors");
  });

  it("falls back to the domain", () => {
    expect(cardTitle({ title: null, domain: "example.com" })).toBe("example.com");
    expect(cardTitle({ title: "  ", domain: "example.com" })).toBe("example.com");
  });
});

describe("cardByline", () => {
  it("takes the first subtitle part", () => {
    expect(cardByline({ subtitle: "Ursula K. Le Guin · 1969", domain: "x.com" })).toBe("Ursula K. Le Guin");
    expect(cardByline({ subtitle: "Denis Villeneuve - 2016", domain: "x.com" })).toBe("Denis Villeneuve");
  });

  it("keeps hyphenated names whole", () => {
    expect(cardByline({ subtitle: "Jean-Luc Godard", domain: "x.com" })).toBe("Jean-Luc Godard");
  });

  it("falls back to the domain without www", () => {
    expect(cardByline({ subtitle: null, domain: "www.example.com" })).toBe("example.com");
  });
});

describe("coverTint", () => {
  it("uses the dominant color", () => {
    expect(coverTint({ dominant_color: "#123456", category: "books" })).toBe("#123456");
    expect(coverTint({ dominant_color: "abcdef", category: "books" })).toBe("#abcdef");
  });

  it("falls back to a category color for a missing or bad value", () => {
    expect(coverTint({ dominant_color: null, category: "books" })).toBe("#6b3a1f");
    expect(coverTint({ dominant_color: "red", category: null })).toBe("#3f3a36");
  });
});

describe("isDarkTint", () => {
  it("separates dark and light colors", () => {
    expect(isDarkTint("#000000")).toBe(true);
    expect(isDarkTint("#2b2550")).toBe(true);
    expect(isDarkTint("#ffffff")).toBe(false);
    expect(isDarkTint("#f0e6d0")).toBe(false);
  });
});

describe("expectsLandscape", () => {
  it("follows the category or stored card aspect", () => {
    expect(expectsLandscape({ category: "books", display: {} })).toBe(false);
    expect(expectsLandscape({ category: "articles", display: {} })).toBe(true);
    expect(expectsLandscape({ category: "products", display: {} })).toBe(true);
    expect(expectsLandscape({ category: "articles", display: { card_aspect: "2/3" } })).toBe(false);
  });
});

describe("coverStatusLabel", () => {
  it("names the status drawn on the cover", () => {
    expect(coverStatusLabel({ status: "want", rating_personal: null })).toBeNull();
    expect(coverStatusLabel({ status: "inbox", rating_personal: null })).toBe("In inbox");
    expect(coverStatusLabel({ status: "done", rating_personal: null })).toBe("Done");
    expect(coverStatusLabel({ status: "done", rating_personal: 5 })).toBe("Done, 5 of 5 stars");
  });

  it("adds the synced state when the item has a book file", () => {
    const file_uploaded_at = "2026-10-21T00:00:00Z";
    expect(coverStatusLabel({ status: "want", rating_personal: null, file_uploaded_at })).toBe(
      "Synced to your e-reader",
    );
    expect(coverStatusLabel({ status: "done", rating_personal: 4, file_uploaded_at })).toBe(
      "Done, 4 of 5 stars, synced to your e-reader",
    );
  });

  it("starts with the pinned state when the item is pinned", () => {
    const pinned_at = "2026-10-24T00:00:00Z";
    expect(coverStatusLabel({ status: "want", rating_personal: null, pinned_at })).toBe("Pinned");
    expect(
      coverStatusLabel({ status: "want", rating_personal: null, pinned_at, file_uploaded_at: pinned_at }),
    ).toBe("Pinned, synced to your e-reader");
  });
});

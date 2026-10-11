import { describe, expect, it } from "vitest";

import {
  decodeHtmlEntities,
  isErrorPageTitle,
  isGeneratedShareCard,
  isJunkDescription,
  isTruncatedTitle,
  isWeakTitle,
  parseImdbTitle,
} from "@/lib/enrichment/meta-utils";

describe("isJunkDescription", () => {
  it("treats empty/short descriptions as junk", () => {
    expect(isJunkDescription(null)).toBe(true);
    expect(isJunkDescription("")).toBe(true);
    expect(isJunkDescription("Too short.")).toBe(true);
  });

  it("treats error and bot-wall text as junk", () => {
    expect(isJunkDescription("Access Denied - you do not have permission to view this page.")).toBe(true);
    expect(isJunkDescription("Please enable JavaScript and complete the captcha to continue to site.")).toBe(true);
    expect(isJunkDescription("404 Not Found: the page you requested does not exist on the server.")).toBe(true);
  });

  it("accepts a real description", () => {
    expect(
      isJunkDescription("Batman raises the stakes in his war on crime with the help of Lt. Jim Gordon."),
    ).toBe(false);
  });
});

describe("isErrorPageTitle", () => {
  it("flags bot-wall / interstitial titles", () => {
    expect(isErrorPageTitle("Just a moment...")).toBe(true);
    expect(isErrorPageTitle("Attention Required! | Cloudflare")).toBe(true);
    expect(isErrorPageTitle("Verifying you are human")).toBe(true);
    expect(isErrorPageTitle("Checking your browser before accessing")).toBe(true);
    expect(isErrorPageTitle("404 Not Found")).toBe(true);
  });

  it("accepts a real title", () => {
    expect(isErrorPageTitle("The Abyss")).toBe(false);
    expect(isErrorPageTitle(null)).toBe(false);
  });
});

describe("isTruncatedTitle", () => {
  it("flags a title cut with a unicode ellipsis", () => {
    expect(isTruncatedTitle("Black in Blues: How a Color Tells the Story of My Peopl\u2026")).toBe(true);
  });

  it("flags a title cut with three dots", () => {
    expect(isTruncatedTitle("Everything Is Tuberculosis: The History and Persistence...")).toBe(true);
  });

  it("ignores an ellipsis inside the title", () => {
    expect(isTruncatedTitle("Wait\u2026 What? A Book")).toBe(false);
  });

  it("ignores a complete title", () => {
    expect(isTruncatedTitle("The Old Man and the Sea")).toBe(false);
  });

  it("ignores an empty title", () => {
    expect(isTruncatedTitle("")).toBe(false);
    expect(isTruncatedTitle(null)).toBe(false);
  });
});

describe("isWeakTitle", () => {
  it("treats a truncated title as weak so a resolver title wins", () => {
    expect(isWeakTitle("Tuesdays with Morrie: An Old Man, a Young Man, and Life\u2026")).toBe(true);
  });

  it("keeps a complete title strong", () => {
    expect(isWeakTitle("Tuesdays with Morrie: An Old Man, a Young Man, and Life's Greatest Lesson")).toBe(false);
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes a named reference", () => {
    expect(decodeHtmlEntities("Life&apos;s Greatest Lesson")).toBe("Life's Greatest Lesson");
  });

  it("decodes a double encoding", () => {
    expect(decodeHtmlEntities("Life&amp;apos;s Lesson")).toBe("Life's Lesson");
  });

  it("decodes decimal and hex references", () => {
    expect(decodeHtmlEntities("Caf&#233; &#x2014; Open")).toBe("Caf\u00e9 \u2014 Open");
  });

  it("leaves an unknown reference alone", () => {
    expect(decodeHtmlEntities("Tom &notarealentity; Jerry")).toBe("Tom &notarealentity; Jerry");
  });

  it("leaves plain text untouched", () => {
    expect(decodeHtmlEntities("The Old Man and the Sea")).toBe("The Old Man and the Sea");
  });

  it("keeps a bare ampersand", () => {
    expect(decodeHtmlEntities("Salt & Pepper")).toBe("Salt & Pepper");
  });
});

describe("parseImdbTitle", () => {
  it("splits a TV series title with a year range, rating and genres", () => {
    expect(parseImdbTitle("Twin Peaks (TV Series 1990–1991) ⭐ 8.7 | Crime, Drama, Mystery")).toEqual({
      title: "Twin Peaks",
      year: 1990,
      genres: ["Crime", "Drama", "Mystery"],
    });
  });

  it("splits a movie title with a rating and genres", () => {
    expect(parseImdbTitle("Patriots Day (2016) ⭐ 7.3 | Action, Crime, Drama")).toEqual({
      title: "Patriots Day",
      year: 2016,
      genres: ["Action", "Crime", "Drama"],
    });
  });

  it("handles the older formats", () => {
    expect(parseImdbTitle("Inception (2010)")).toEqual({ title: "Inception", year: 2010 });
    expect(parseImdbTitle("Tremors (1990) - IMDb")).toEqual({ title: "Tremors", year: 1990 });
    expect(parseImdbTitle("Alien | IMDb")).toEqual({ title: "Alien" });
  });

  it("keeps parentheses that hold no year", () => {
    expect(parseImdbTitle("M*A*S*H (Pilot)")).toEqual({ title: "M*A*S*H (Pilot)" });
  });

  it("returns undefined for an empty title", () => {
    expect(parseImdbTitle("")).toBeUndefined();
    expect(parseImdbTitle(undefined)).toBeUndefined();
  });
});

describe("isGeneratedShareCard", () => {
  it("flags the hardcover.app rendered share card", () => {
    expect(isGeneratedShareCard("https://hardcover.app/books/the-three-body-problem/ogimage.png")).toBe(true);
  });

  it("keeps real covers and other hosts", () => {
    expect(isGeneratedShareCard("https://assets.hardcover.app/edition/30854539/cover.jpg")).toBe(false);
    expect(isGeneratedShareCard("https://example.com/ogimage.png")).toBe(false);
    expect(isGeneratedShareCard(null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { goodreadsUrlForItem } from "./goodreads-link";

const book = {
  category: "books" as const,
  domain: "openlibrary.org",
  title: "Children of Time",
  structured: { authors: ["Adrian Tchaikovsky"] },
};

describe("goodreadsUrlForItem", () => {
  it("searches for the title and the first author when there is no ISBN", () => {
    expect(goodreadsUrlForItem(book)).toBe(
      "https://www.goodreads.com/search?q=Children%20of%20Time%20Adrian%20Tchaikovsky",
    );
  });

  it("searches for the ISBN when the book has one", () => {
    expect(
      goodreadsUrlForItem({ ...book, structured: { ...book.structured, isbn: "978-0-375-82669-6" } }),
    ).toBe("https://www.goodreads.com/search?q=9780375826696");
  });

  it("accepts an ISBN-10 that ends in X", () => {
    expect(goodreadsUrlForItem({ ...book, structured: { isbn: "0-8044-2957-x" } })).toBe(
      "https://www.goodreads.com/search?q=080442957X",
    );
  });

  it("ignores an invalid ISBN and searches for the title", () => {
    expect(goodreadsUrlForItem({ ...book, structured: { isbn: "n/a", authors: [] } })).toBe(
      "https://www.goodreads.com/search?q=Children%20of%20Time",
    );
  });

  it("returns null for a book saved from Goodreads", () => {
    expect(goodreadsUrlForItem({ ...book, domain: "www.goodreads.com" })).toBeNull();
    expect(goodreadsUrlForItem({ ...book, domain: "goodreads.com" })).toBeNull();
  });

  it("returns null for other categories", () => {
    expect(goodreadsUrlForItem({ ...book, category: "movies_and_tv" })).toBeNull();
  });

  it("returns null when there is no title and no ISBN", () => {
    expect(goodreadsUrlForItem({ ...book, title: "  " })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { getDetailFields, getHeadlineFacts } from "@/lib/item-detail-display";

const MOVIE_SAMPLE = {
  year: 2024,
  genres: ["Horror"],
  rating: 3.6,
  directors: ["Cameron Cairnes", "Colin Cairnes"],
  site_name: "The Movie Database",
  media_type: "movie",
  rating_scale: 5,
  runtime_minutes: 93,
};

const BOOK_SAMPLE = {
  isbn: "9780062570604",
  authors: ["Justina Ireland"],
  site_name: "Goodreads",
  page_count: 455,
  ratings_count: 36490,
  average_rating: 4.13,
  published_year: 2018,
};

describe("getHeadlineFacts — movies_and_tv", () => {
  it("orders year, genres, runtime, rating and drops the scale", () => {
    expect(getHeadlineFacts("movies_and_tv", MOVIE_SAMPLE)).toEqual([
      "2024",
      "Horror",
      "1 h 33 m",
      "★ 3.6",
    ]);
  });

  it("joins multiple genres with a comma", () => {
    expect(
      getHeadlineFacts("movies_and_tv", { genres: ["Horror", "Thriller"] }),
    ).toEqual(["Horror, Thriller"]);
  });

  it("skips segments whose source key is absent", () => {
    expect(getHeadlineFacts("movies_and_tv", { year: 1999 })).toEqual(["1999"]);
  });
});

describe("getHeadlineFacts — books", () => {
  it("orders published year, page count, and rating with ratings count", () => {
    expect(getHeadlineFacts("books", BOOK_SAMPLE)).toEqual([
      "2018",
      "455 pages",
      "★ 4.13 · 36,490 ratings",
    ]);
  });

  it("shows rating alone when there is no ratings count", () => {
    expect(getHeadlineFacts("books", { average_rating: 4.5 })).toEqual([
      "★ 4.5",
    ]);
  });

  it("skips the rating segment when only a count is present", () => {
    expect(getHeadlineFacts("books", { ratings_count: 12 })).toEqual([]);
  });

  it("uses a singular page label for a one-page book", () => {
    expect(getHeadlineFacts("books", { page_count: 1 })).toEqual(["1 page"]);
  });
});

describe("getHeadlineFacts — articles", () => {
  it("pulls the 4-digit year out of published_at and then the author", () => {
    expect(
      getHeadlineFacts("articles", {
        published_at: "2024-05-01T12:00:00Z",
        author: "Ada Lovelace",
      }),
    ).toEqual(["2024", "Ada Lovelace"]);
  });
});

describe("getHeadlineFacts — other and null", () => {
  it("returns nothing for long-tail categories", () => {
    for (const category of ["restaurants", "products", "travel", "recipes"] as const) {
      expect(getHeadlineFacts(category, { anything: 1 })).toEqual([]);
    }
  });

  it("returns nothing for a null category", () => {
    expect(getHeadlineFacts(null, BOOK_SAMPLE)).toEqual([]);
  });

  it("returns nothing for a null structured payload", () => {
    expect(getHeadlineFacts("movies_and_tv", null)).toEqual([]);
  });
});

describe("runtime formatting", () => {
  const cases: Array<[number, string]> = [
    [93, "1 h 33 m"],
    [85, "1 h 25 m"],
    [45, "45 m"],
    [60, "1 h"],
    [120, "2 h"],
  ];
  for (const [minutes, expected] of cases) {
    it(`formats ${minutes} minutes as "${expected}"`, () => {
      expect(getHeadlineFacts("movies_and_tv", { runtime_minutes: minutes })).toEqual([
        expected,
      ]);
    });
  }
});

describe("getDetailFields — suppression", () => {
  it("never shows suppressed keys for a movie", () => {
    const keys = getDetailFields("movies_and_tv", MOVIE_SAMPLE).map((r) => r.key);
    expect(keys).not.toContain("site_name");
    expect(keys).not.toContain("media_type");
    expect(keys).not.toContain("rating_scale");
    expect(keys).not.toContain("original_type");
  });

  it("leaves only curated directors for a movie", () => {
    expect(getDetailFields("movies_and_tv", MOVIE_SAMPLE)).toEqual([
      { key: "directors", label: "Directors", value: "Cameron Cairnes, Colin Cairnes" },
    ]);
  });
});

describe("getDetailFields — byline promotion", () => {
  it("removes byline-promoted keys from a movie's details", () => {
    const keys = getDetailFields("movies_and_tv", MOVIE_SAMPLE).map((r) => r.key);
    expect(keys).not.toContain("year");
    expect(keys).not.toContain("genres");
    expect(keys).not.toContain("runtime_minutes");
    expect(keys).not.toContain("rating");
  });

  it("removes byline-promoted keys from a book's details", () => {
    const keys = getDetailFields("books", BOOK_SAMPLE).map((r) => r.key);
    for (const promoted of [
      "published_year",
      "page_count",
      "average_rating",
      "ratings_count",
    ]) {
      expect(keys).not.toContain(promoted);
    }
  });
});

describe("getDetailFields — ordering and labels", () => {
  it("leads a book with authors and ends with isbn", () => {
    const rows = getDetailFields("books", { ...BOOK_SAMPLE, publisher: "Balzer + Bray" });
    expect(rows).toEqual([
      { key: "authors", label: "Authors", value: "Justina Ireland" },
      { key: "publisher", label: "Publisher", value: "Balzer + Bray" },
      { key: "isbn", label: "ISBN", value: "9780062570604" },
    ]);
  });

  it("formats recipe-ish article times and yield in curated order", () => {
    const rows = getDetailFields("articles", {
      author: "Chef",
      published_at: "2023",
      publisher: "Serious Eats",
      cook_time_minutes: 45,
      prep_time_minutes: 20,
      yield: "4 servings",
      rating: 4.5,
    });
    expect(rows).toEqual([
      { key: "publisher", label: "Publisher", value: "Serious Eats" },
      { key: "cook_time_minutes", label: "Cook time", value: "45 m" },
      { key: "prep_time_minutes", label: "Prep time", value: "20 m" },
      { key: "yield", label: "Yield", value: "4 servings" },
      { key: "rating", label: "Rating", value: "★ 4.5" },
    ]);
  });
});

describe("getDetailFields — unknown-key fallback", () => {
  it("appends a novel key at the end with a humanized label", () => {
    const rows = getDetailFields("movies_and_tv", {
      ...MOVIE_SAMPLE,
      awards: "Best Picture",
    });
    expect(rows).toEqual([
      { key: "directors", label: "Directors", value: "Cameron Cairnes, Colin Cairnes" },
      { key: "awards", label: "Awards", value: "Best Picture" },
    ]);
  });

  it("renders all non-suppressed keys generically for other categories", () => {
    const rows = getDetailFields("restaurants", {
      cuisine: "Thai",
      price_level: 2,
      site_name: "Yelp",
    });
    expect(rows).toEqual([
      { key: "cuisine", label: "Cuisine", value: "Thai" },
      { key: "price_level", label: "Price Level", value: "2" },
    ]);
  });
});

describe("getDetailFields — omitKeys and underscore keys", () => {
  it("respects omitKeys and skips underscore-prefixed keys", () => {
    const rows = getDetailFields(
      "books",
      { authors: ["A"], isbn: "123", _internal: "x", description: "d" },
      ["description"],
    );
    const keys = rows.map((r) => r.key);
    expect(keys).toEqual(["authors", "isbn"]);
    expect(keys).not.toContain("_internal");
    expect(keys).not.toContain("description");
  });
});

describe("getDetailFields — guards", () => {
  it("returns an empty array for a null payload", () => {
    expect(getDetailFields("books", null)).toEqual([]);
  });
});

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  detectLetterboxdZip,
  letterboxdFilmUrl,
  parseLetterboxdZip,
} from "@/lib/import/parsers/letterboxd-zip";
import { detectImporter } from "@/lib/import";
import type { ImportRow } from "@/lib/import/types";

// `Rating` is blank in every diary and review row on purpose: the ratings a
// test asserts can then only have arrived through the `(Name, Year)` join with
// ratings.csv, which is the join that a naive URI-based one gets wrong.
const FILES: Record<string, string> = {
  "ratings.csv": [
    "Date,Name,Year,Letterboxd URI,Rating",
    "2020-01-06,Knives Out,2019,https://boxd.it/jWEA,4.5",
    "2023-01-15,Aftersun,2022,https://boxd.it/sJhE,3.0",
  ].join("\n"),
  "diary.csv": [
    "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date",
    "2020-01-06,Knives Out,2019,https://boxd.it/aBcDeFg,,No,cozy,2020-01-05",
    '2023-11-21,Knives Out,2019,https://boxd.it/hIjKlMn,,Yes,"cozy, #rewatch",2023-11-20',
    // Excel round-tripped this file, so the date is M/D/YYYY.
    "2023-08-11,Aftersun,2022,https://boxd.it/oPqRsTu,,No,,8/10/2023",
    // 2017-era export: a user-scoped canonical URL with a visit number.
    "2019-06-02,Heat,1995,https://letterboxd.com/someuser/film/heat/2/,,Yes,,2019-06-01",
  ].join("\n"),
  "reviews.csv": [
    "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date",
    '2023-11-21,Knives Out,2019,https://boxd.it/hIjKlMn,,Yes,"<p>Still the best ""whodunnit"" of the decade.</p>Second viewing confirmed it.",#rewatch,2023-11-20',
  ].join("\n"),
  "watched.csv": [
    "Date,Name,Year,Letterboxd URI",
    "2020-01-06,Knives Out,2019,https://boxd.it/jWEA",
    "2023-01-15,Aftersun,2022,https://boxd.it/sJhE",
  ].join("\n"),
  "watchlist.csv": [
    "Date,Name,Year,Letterboxd URI",
    "2024-02-01,Portrait of a Lady on Fire,2019,https://boxd.it/gT5o",
  ].join("\n"),
  // Same schemas, same file names: a recursive glob would import these too.
  "deleted/diary.csv": [
    "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date",
    "2018-01-01,Deleted Film,2001,https://boxd.it/dEaD,4.0,No,,2018-01-01",
  ].join("\n"),
  "orphaned/watched.csv": [
    "Date,Name,Year,Letterboxd URI",
    "2018-02-02,Orphan Film,2002,https://boxd.it/oRpH",
  ].join("\n"),
  "lists/favourites.csv": [
    "Date,Name,Tags,URL,Description",
    "2022-01-01,Favourites,,https://letterboxd.com/someuser/list/favourites/,",
    "",
    "Position,Name,Year,URL,Description",
    "1,Heat,1995,https://boxd.it/2bMY,",
  ].join("\n"),
  "profile.csv": "Date Joined,Username\n2016-04-01,someuser",
};

function buildZip(prefix = ""): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(FILES)) {
    entries[`${prefix}${name}`] = strToU8(text);
  }
  return zipSync(entries);
}

function byTitle(rows: ImportRow[], title: string): ImportRow | undefined {
  return rows.find((row) => row.title === title);
}

describe("letterboxdFilmUrl", () => {
  it("passes boxd.it shortlinks through and rebuilds old canonical URLs", () => {
    // Never resolved: following the redirect is one HTTP request per row.
    expect(letterboxdFilmUrl("https://boxd.it/jWEA")).toBe("https://boxd.it/jWEA");
    expect(letterboxdFilmUrl("https://letterboxd.com/someuser/film/heat/")).toBe(
      "https://letterboxd.com/film/heat/",
    );
    // A diary entry adds a visit number; the film is still the same film.
    expect(letterboxdFilmUrl("https://letterboxd.com/someuser/film/heat/2/")).toBe(
      "https://letterboxd.com/film/heat/",
    );
    expect(letterboxdFilmUrl("")).toBeNull();
    expect(letterboxdFilmUrl("not a url")).toBeNull();
  });
});

describe("detectLetterboxdZip", () => {
  it("recognises the archive from its bytes and ignores everything else", () => {
    expect(detectLetterboxdZip({ text: "", bytes: buildZip() })).toBe(true);
    expect(detectLetterboxdZip({ text: "", bytes: null })).toBe(false);
    expect(detectLetterboxdZip({ text: "", bytes: strToU8("not a zip at all") })).toBe(false);
    expect(
      detectLetterboxdZip({ text: "", bytes: zipSync({ "notes.txt": strToU8("hi") }) }),
    ).toBe(false);
  });

  it("is the importer chosen for a .zip upload", () => {
    const importer = detectImporter({
      text: "",
      bytes: buildZip("letterboxd-someuser-2024-03-01-09-15-utc/"),
      filename: "letterboxd-someuser-2024-03-01-09-15-utc.zip",
    });
    expect(importer?.id).toBe("letterboxd-zip");
  });
});

describe("parseLetterboxdZip", () => {
  const result = parseLetterboxdZip({ text: "", bytes: buildZip(), filename: "letterboxd.zip" });

  it("collapses a rewatch into a single item", () => {
    // Two diary rows for Knives Out, each with its own entry-level URI. Keying
    // on the URI would produce two items for one film.
    const knivesOut = result.rows.filter((row) => row.title === "Knives Out");
    expect(knivesOut).toHaveLength(1);
    expect(result.rows.map((row) => row.title)).toEqual([
      "Knives Out",
      "Aftersun",
      "Heat",
      "Portrait of a Lady on Fire",
    ]);
  });

  it("joins diary to ratings on (Name, Year), not on the URI", () => {
    // diary.csv leaves Rating blank and its URIs appear nowhere else, so a 5
    // here can only have come from ratings.csv via the title/year join.
    expect(byTitle(result.rows, "Knives Out")).toMatchObject({
      url: "https://boxd.it/jWEA",
      rating_personal: 5,
      status: "done",
    });
    expect(byTitle(result.rows, "Knives Out")?.source_ref).toMatchObject({
      importer: "letterboxd-zip",
      external_id: "jWEA",
      raw_rating: "4.5",
      file: "ratings.csv",
    });
    expect(byTitle(result.rows, "Aftersun")?.rating_personal).toBe(3);
  });

  it("takes the film-level URI for the URL and the latest Watched Date for done_at", () => {
    expect(byTitle(result.rows, "Knives Out")).toMatchObject({
      done_at: "2023-11-20T00:00:00.000Z",
      created_at_hint: "2020-01-06T00:00:00.000Z",
      category: "movies_and_tv",
      subtitle: "2019",
      labels: ["cozy", "#rewatch"],
    });
  });

  it("is lenient about an Excel-rewritten date", () => {
    expect(byTitle(result.rows, "Aftersun")?.done_at).toBe("2023-08-10T00:00:00.000Z");
  });

  it("flattens the HTML review into the verdict", () => {
    expect(byTitle(result.rows, "Knives Out")?.verdict).toBe(
      'Still the best "whodunnit" of the decade.\nSecond viewing confirmed it.',
    );
  });

  it("rebuilds a film URL for a film that only appears in diary.csv", () => {
    expect(byTitle(result.rows, "Heat")).toMatchObject({
      url: "https://letterboxd.com/film/heat/",
      status: "done",
      done_at: "2019-06-01T00:00:00.000Z",
      rating_personal: null,
    });
    expect(byTitle(result.rows, "Heat")?.source_ref.external_id).toBe("heat");
  });

  it("keeps a watchlist-only film on the want shelf with no watch date", () => {
    expect(byTitle(result.rows, "Portrait of a Lady on Fire")).toMatchObject({
      url: "https://boxd.it/gT5o",
      status: "want",
      done_at: null,
      rating_personal: null,
    });
  });

  it("never reads deleted/ or orphaned/, which mirror the same schemas", () => {
    expect(byTitle(result.rows, "Deleted Film")).toBeUndefined();
    expect(byTitle(result.rows, "Orphan Film")).toBeUndefined();
    expect(result.warnings.some((w) => w.includes("deleted/"))).toBe(true);
  });

  it("says that custom lists were left out rather than importing them silently", () => {
    expect(result.warnings.some((w) => w.includes("lists/"))).toBe(true);
  });

  it("reads an archive wrapped in the export directory", () => {
    const wrapped = parseLetterboxdZip({
      text: "",
      bytes: buildZip("letterboxd-someuser-2024-03-01-09-15-utc/"),
      filename: "letterboxd-someuser-2024-03-01-09-15-utc.zip",
    });
    expect(wrapped.rows.map((row) => row.title)).toEqual(result.rows.map((row) => row.title));
  });

  it("explains itself instead of throwing when the bytes are missing or wrong", () => {
    expect(parseLetterboxdZip({ text: "", bytes: null }).warnings[0]).toContain(".zip");
    const other = parseLetterboxdZip({ text: "", bytes: zipSync({ "notes.txt": strToU8("hi") }) });
    expect(other.rows).toEqual([]);
    expect(other.warnings[0]).toContain("does not contain a Letterboxd export");
    const corrupt = parseLetterboxdZip({ text: "", bytes: strToU8("PK nope") });
    expect(corrupt.rows).toEqual([]);
    expect(corrupt.warnings).toHaveLength(1);
  });
});

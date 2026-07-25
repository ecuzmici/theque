import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { csvImporterFromPreset, detectCsvPreset } from "@/lib/import/csv-engine";
import { CSV_PRESETS, imdbListPreset, imdbRatingsPreset } from "@/lib/import/presets";
import type { ImportInput } from "@/lib/import/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fixture(name: string): ImportInput {
  return {
    text: readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8"),
    filename: name,
  };
}

const ratings = csvImporterFromPreset(imdbRatingsPreset);
const list = csvImporterFromPreset(imdbListPreset);

describe("imdb ratings preset", () => {
  it("is picked for a ratings export and not for a watchlist", () => {
    expect(detectCsvPreset(fixture("imdb-ratings.csv"), CSV_PRESETS)?.id).toBe("imdb-ratings");
    expect(detectCsvPreset(fixture("imdb-ratings-legacy.csv"), CSV_PRESETS)?.id).toBe(
      "imdb-ratings",
    );
    expect(detectCsvPreset(fixture("imdb-watchlist.csv"), CSV_PRESETS)?.id).toBe("imdb-list");
  });

  it("normalizes Your Rating from 1..10 and ignores IMDb Rating", async () => {
    const result = await ratings.parse(fixture("imdb-ratings.csv"));
    expect(result.rows.map((row) => row.rating_personal)).toEqual([4, 5, 2]);
    // The community score for the last row is 9.5; the user gave it 3.
    expect(result.rows[2].source_ref.raw_rating).toBe("3");
  });

  it("keys identity on Const and URL, which do not change with account language", async () => {
    const result = await ratings.parse(fixture("imdb-ratings.csv"));
    expect(result.rows[1]).toMatchObject({
      url: "https://www.imdb.com/title/tt0111161",
      // Localized title and genres, kept as the user sees them.
      title: "쇼생크 탈출",
      labels: ["범죄", "미스터리"],
      category: "movies_and_tv",
      status: "done",
    });
    expect(result.rows[1].source_ref.external_id).toBe("tt0111161");
  });

  it("uses Date Rated as the done_at proxy and composes a director subtitle", async () => {
    const result = await ratings.parse(fixture("imdb-ratings.csv"));
    expect(result.rows[0].done_at).toBe("2020-01-05T00:00:00.000Z");
    expect(result.rows[0].subtitle).toBe("Rian Johnson · 2019");
    // No director on the TV row: the year still shows.
    expect(result.rows[2].subtitle).toBe("2008");
  });

  it("reads the legacy 13-column export that has no Original Title", async () => {
    const result = await ratings.parse(fixture("imdb-ratings-legacy.csv"));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ title: "Knives Out", rating_personal: 4 });
  });
});

describe("imdb list preset", () => {
  it("keeps unrated watchlist entries on the want shelf", async () => {
    const result = await list.parse(fixture("imdb-watchlist.csv"));
    expect(result.rows[0]).toMatchObject({
      // Watchlist URLs carry a trailing slash; the raw value is preserved and
      // `normalizeUrl` reconciles it with the ratings export at ingest.
      url: "https://www.imdb.com/title/tt0110912/",
      status: "want",
      rating_personal: null,
      verdict: "For the dialogue",
      created_at_hint: "2021-04-03T00:00:00.000Z",
      category: "movies_and_tv",
    });
  });

  it("moves an entry that has since been rated to done", async () => {
    const result = await list.parse(fixture("imdb-watchlist.csv"));
    expect(result.rows[1]).toMatchObject({
      status: "done",
      rating_personal: 4,
      done_at: "2021-06-01T00:00:00.000Z",
    });
  });

  it("parses the variant without the optional Your Rating / Date Rated columns", async () => {
    const text = [
      "Position,Const,Created,Modified,Description,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors",
      "1,tt0110912,2021-04-03,2021-04-03,,Pulp Fiction,Pulp Fiction,https://www.imdb.com/title/tt0110912/,Movie,8.9,154,1994,Crime,2100000,1994-05-21,Quentin Tarantino",
    ].join("\n");
    const input: ImportInput = { text, filename: "WATCHLIST.csv" };
    expect(detectCsvPreset(input, CSV_PRESETS)?.id).toBe("imdb-list");

    const result = await list.parse(input);
    expect(result.rows[0]).toMatchObject({ status: "want", rating_personal: null, done_at: null });
  });
});

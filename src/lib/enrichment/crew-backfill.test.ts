import { describe, expect, it } from "vitest";

import { computeCrewBackfill } from "@/lib/enrichment/crew-backfill";
import type { ResolvedMovie } from "@/lib/recommend/resolve/tmdb";

function resolved(partial: Partial<ResolvedMovie>): ResolvedMovie {
  return {
    canonical_url: "https://www.themoviedb.org/movie/2756",
    cover_url: null,
    confirmed_year: 1989,
    external_id: "2756",
    verified_author: null,
    ...partial,
  };
}

describe("computeCrewBackfill", () => {
  it("overwrites a memory-sourced wrong director on a TMDB hit", () => {
    const r = computeCrewBackfill({
      structured: { directors: ["Ed Harris"], year: 1989 },
      fieldSources: { directors: "model_knowledge" },
      tmdb: resolved({ directors: ["James Cameron"] }),
    });
    expect(r.changed).toBe(true);
    expect(r.nextStructured.directors).toEqual(["James Cameron"]);
    expect(r.nextStructured.year).toBe(1989); // untouched
    expect(r.log.directors).toEqual({ prior: ["Ed Harris"], next: ["James Cameron"] });
  });

  it("overwrites runtime, genres, and rating on a hit", () => {
    const r = computeCrewBackfill({
      structured: { directors: ["James Cameron"] },
      fieldSources: { directors: "page" },
      tmdb: resolved({
        directors: ["James Cameron"],
        runtime_minutes: 145,
        genres: ["Sci-Fi", "Adventure"],
        source_rating: 3.7,
      }),
    });
    expect(r.nextStructured.runtime_minutes).toBe(145);
    expect(r.nextStructured.genres).toEqual(["Sci-Fi", "Adventure"]);
    expect(r.nextStructured.rating).toBe(3.7);
    expect(r.nextStructured.rating_scale).toBe(5);
    expect(r.changed).toBe(true);
  });

  it("clears a model_knowledge director when TMDB has no match", () => {
    const r = computeCrewBackfill({
      structured: { directors: ["Nicholas Braun"], year: 2018 },
      fieldSources: { directors: "model_knowledge" },
      tmdb: null,
    });
    expect(r.changed).toBe(true);
    expect("directors" in r.nextStructured).toBe(false);
    expect(r.nextStructured.year).toBe(2018);
    expect(r.log.directors).toEqual({ prior: ["Nicholas Braun"], next: null });
  });

  it("keeps a page-sourced director when TMDB has no match", () => {
    const r = computeCrewBackfill({
      structured: { directors: ["Kenneth Lonergan"] },
      fieldSources: { directors: "page" },
      tmdb: null,
    });
    expect(r.changed).toBe(false);
    expect(r.nextStructured.directors).toEqual(["Kenneth Lonergan"]);
  });

  it("leaves a director untouched when provenance is unknown and TMDB misses", () => {
    const r = computeCrewBackfill({
      structured: { directors: ["Some Name"] },
      fieldSources: undefined,
      tmdb: null,
    });
    expect(r.changed).toBe(false);
    expect(r.nextStructured.directors).toEqual(["Some Name"]);
  });

  it("is idempotent — a second run over already-correct data writes nothing", () => {
    const structured = {
      directors: ["James Cameron"],
      runtime_minutes: 145,
      genres: ["Sci-Fi"],
      rating: 3.7,
      rating_scale: 5,
    };
    const r = computeCrewBackfill({
      structured,
      fieldSources: { directors: "page" },
      tmdb: resolved({
        directors: ["James Cameron"],
        runtime_minutes: 145,
        genres: ["Sci-Fi"],
        source_rating: 3.7,
      }),
    });
    expect(r.changed).toBe(false);
    expect(r.log).toEqual({});
    expect(r.nextStructured).toEqual(structured);
  });
});

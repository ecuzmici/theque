import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveMusic } from "@/lib/enrichment/resolvers/itunes";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("resolveMusic", () => {
  it("returns null without a title", async () => {
    expect(await resolveMusic({ canonicalUrl: "https://x", title: null, structured: {} })).toBeNull();
  });

  it("maps an album hit to artist, album, release_year, genre, image", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            artistName: "Radiohead",
            collectionName: "In Rainbows",
            primaryGenreName: "Alternative",
            releaseDate: "2007-10-10T07:00:00Z",
            artworkUrl100: "https://is1.mzstatic.com/100x100.jpg",
          },
        ],
      }),
    });

    const patch = await resolveMusic({ canonicalUrl: "https://x", title: "In Rainbows", structured: {} });

    expect(patch).toEqual({
      source: "itunes",
      image_url: "https://is1.mzstatic.com/600x600.jpg",
      structured: {
        artist: "Radiohead",
        album: "In Rainbows",
        release_year: 2007,
        genre: "Alternative",
      },
    });
  });

  it("returns null on empty results", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    expect(await resolveMusic({ canonicalUrl: "https://x", title: "x", structured: {} })).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("net"));
    expect(await resolveMusic({ canonicalUrl: "https://x", title: "x", structured: {} })).toBeNull();
  });
});

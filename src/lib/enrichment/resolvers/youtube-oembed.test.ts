import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveVideo } from "@/lib/enrichment/resolvers/youtube-oembed";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("resolveVideo", () => {
  it("ignores non-YouTube URLs", async () => {
    expect(
      await resolveVideo({ canonicalUrl: "https://vimeo.com/123", title: null, structured: {} }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a youtube.com hit to title, channel, thumbnail", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        title: "Never Gonna Give You Up",
        author_name: "Rick Astley",
        thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      }),
    });

    const patch = await resolveVideo({
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: null,
      structured: {},
    });

    expect(patch).toEqual({
      source: "youtube_oembed",
      title: "Never Gonna Give You Up",
      image_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      structured: { channel: "Rick Astley" },
    });
  });

  it("acts on youtu.be short links", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ title: "X", author_name: "Y", thumbnail_url: "https://t.jpg" }),
    });
    const patch = await resolveVideo({ canonicalUrl: "https://youtu.be/abc", title: null, structured: {} });
    expect(patch?.source).toBe("youtube_oembed");
  });

  it("returns null on non-200", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(
      await resolveVideo({ canonicalUrl: "https://www.youtube.com/watch?v=x", title: null, structured: {} }),
    ).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fetchMocks = vi.hoisted(() => ({ assertSafeFetchUrl: vi.fn() }));
vi.mock("@/lib/enrichment/fetch", () => ({
  assertSafeFetchUrl: fetchMocks.assertSafeFetchUrl,
}));

// The extractor downscales via sharp's processing chain and reads raw pixels;
// `stats()` is only the grayscale fallback. Mock a chainable sharp accordingly.
const sharpMocks = vi.hoisted(() => ({ toBuffer: vi.fn(), stats: vi.fn() }));
vi.mock("sharp", () => ({
  default: () => {
    const chain: Record<string, unknown> = {
      resize: () => chain,
      toColourspace: () => chain,
      removeAlpha: () => chain,
      raw: () => chain,
      toBuffer: sharpMocks.toBuffer,
      stats: sharpMocks.stats,
    };
    return chain;
  },
}));

import { cacheItemImage, extractDominantColorForUrl } from "@/lib/enrichment/image-cache";

/** Build a raw RGB buffer: `runs` of [r,g,b] repeated `count` times each. */
function rawPixels(runs: Array<{ rgb: [number, number, number]; count: number }>) {
  const total = runs.reduce((n, r) => n + r.count, 0);
  const data = new Uint8Array(total * 3);
  let o = 0;
  for (const { rgb, count } of runs) {
    for (let i = 0; i < count; i += 1) {
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
      o += 3;
    }
  }
  return { data, info: { width: 1, height: total, channels: 3 } };
}

function fakeImageResponse(bytes = "fake-jpeg-bytes", contentType = "image/jpeg") {
  return new Response(bytes, { status: 200, headers: { "content-type": contentType } });
}

function fakeAdmin(uploadError: { message: string } | null = null) {
  const upload = vi.fn().mockResolvedValue({ error: uploadError });
  return { admin: { storage: { from: () => ({ upload }) } } as never, upload };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMocks.assertSafeFetchUrl.mockReset().mockResolvedValue(undefined);
  sharpMocks.toBuffer.mockReset();
  sharpMocks.stats.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cacheItemImage", () => {
  it("uploads the fetched image and returns a vivid dominant color", async () => {
    fetchMock.mockResolvedValue(fakeImageResponse());
    sharpMocks.toBuffer.mockResolvedValue(rawPixels([{ rgb: [200, 100, 50], count: 16 }]));
    const { admin, upload } = fakeAdmin();

    const result = await cacheItemImage(admin, "user-1", "item-1", "https://covers.example/a.jpg");

    expect(result.storagePath).toBe("user-1/item-1/cover.jpg");
    expect(result.dominantColor).toBe("#c86432");
    expect(result.dominantHue).not.toBeNull();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("ignores a dark background and picks the vivid accent instead", async () => {
    fetchMock.mockResolvedValue(fakeImageResponse());
    // Mostly near-black, a minority of saturated pixels — old code returned black.
    sharpMocks.toBuffer.mockResolvedValue(
      rawPixels([
        { rgb: [8, 8, 8], count: 48 },
        { rgb: [200, 100, 50], count: 8 },
      ]),
    );
    sharpMocks.stats.mockResolvedValue({ dominant: { r: 8, g: 8, b: 8 } });
    const { admin } = fakeAdmin();

    const result = await cacheItemImage(admin, "user-1", "item-1", "https://covers.example/a.jpg");

    expect(result.dominantColor).toBe("#c86432");
  });

  it("still extracts a dominant color even when the storage upload fails", async () => {
    fetchMock.mockResolvedValue(fakeImageResponse());
    sharpMocks.toBuffer.mockResolvedValue(rawPixels([{ rgb: [200, 100, 50], count: 16 }]));
    const { admin } = fakeAdmin({ message: "storage quota exceeded" });

    const result = await cacheItemImage(admin, "user-1", "item-1", "https://covers.example/a.jpg");

    expect(result.storagePath).toBeNull();
    expect(result.dominantColor).toBe("#c86432");
  });

  it("falls back to sharp's dominant bin for a grayscale cover", async () => {
    fetchMock.mockResolvedValue(fakeImageResponse());
    sharpMocks.toBuffer.mockResolvedValue(rawPixels([{ rgb: [128, 128, 128], count: 16 }]));
    sharpMocks.stats.mockResolvedValue({ dominant: { r: 128, g: 128, b: 128 } });
    const { admin } = fakeAdmin();

    const result = await cacheItemImage(admin, "user-1", "item-1", "https://covers.example/gray.jpg");

    expect(result.dominantColor).toBe("#808080");
  });

  it("returns no-image when the fetch fails", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    const { admin, upload } = fakeAdmin();

    const result = await cacheItemImage(admin, "user-1", "item-1", "https://covers.example/missing.jpg");

    expect(result).toEqual({ storagePath: null, dominantColor: null, dominantHue: null });
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects unsafe URLs before fetching", async () => {
    fetchMocks.assertSafeFetchUrl.mockRejectedValue(new Error("blocked_fetch_url"));
    const { admin } = fakeAdmin();

    const result = await cacheItemImage(admin, "user-1", "item-1", "http://169.254.169.254/secret");

    expect(result).toEqual({ storagePath: null, dominantColor: null, dominantHue: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("extractDominantColorForUrl", () => {
  it("re-extracts a vivid color without touching storage", async () => {
    fetchMock.mockResolvedValue(fakeImageResponse());
    sharpMocks.toBuffer.mockResolvedValue(rawPixels([{ rgb: [200, 100, 50], count: 16 }]));

    const result = await extractDominantColorForUrl("https://covers.example/a.jpg");

    expect(result.storagePath).toBeNull();
    expect(result.dominantColor).toBe("#c86432");
  });

  it("logs and returns a null color when sharp throws, instead of failing silently", async () => {
    fetchMock.mockResolvedValue(fakeImageResponse());
    sharpMocks.toBuffer.mockRejectedValue(new Error("unsupported image format"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await extractDominantColorForUrl("https://covers.example/a.jpg");

    expect(result.dominantColor).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("dominant color extraction failed"),
      "unsupported image format",
    );
  });

  it("returns no-image when the source fetch fails, without throwing", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await extractDominantColorForUrl("https://covers.example/a.jpg");

    expect(result).toEqual({ storagePath: null, dominantColor: null, dominantHue: null });
  });
});

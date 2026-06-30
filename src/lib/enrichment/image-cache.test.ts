import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fetchMocks = vi.hoisted(() => ({ assertSafeFetchUrl: vi.fn() }));
vi.mock("@/lib/enrichment/fetch", () => ({
  assertSafeFetchUrl: fetchMocks.assertSafeFetchUrl,
}));

const sharpMocks = vi.hoisted(() => ({ stats: vi.fn() }));
vi.mock("sharp", () => ({
  default: () => ({ stats: sharpMocks.stats }),
}));

import { cacheItemImage, extractDominantColorForUrl } from "@/lib/enrichment/image-cache";

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
  sharpMocks.stats.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cacheItemImage", () => {
  it("uploads the fetched image and returns its storage path and dominant color", async () => {
    fetchMock.mockResolvedValue(fakeImageResponse());
    sharpMocks.stats.mockResolvedValue({ dominant: { r: 10, g: 20, b: 30 } });
    const { admin, upload } = fakeAdmin();

    const result = await cacheItemImage(admin, "user-1", "item-1", "https://covers.example/a.jpg");

    expect(result.storagePath).toBe("user-1/item-1/cover.jpg");
    expect(result.dominantColor).toBe("#0a141e");
    expect(result.dominantHue).not.toBeNull();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("still extracts a dominant color even when the storage upload fails", async () => {
    fetchMock.mockResolvedValue(fakeImageResponse());
    sharpMocks.stats.mockResolvedValue({ dominant: { r: 10, g: 20, b: 30 } });
    const { admin } = fakeAdmin({ message: "storage quota exceeded" });

    const result = await cacheItemImage(admin, "user-1", "item-1", "https://covers.example/a.jpg");

    expect(result.storagePath).toBeNull();
    expect(result.dominantColor).toBe("#0a141e");
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
  it("re-extracts color without touching storage", async () => {
    fetchMock.mockResolvedValue(fakeImageResponse());
    sharpMocks.stats.mockResolvedValue({ dominant: { r: 200, g: 100, b: 50 } });

    const result = await extractDominantColorForUrl("https://covers.example/a.jpg");

    expect(result.storagePath).toBeNull();
    expect(result.dominantColor).toBe("#c86432");
  });

  it("logs and returns a null color when sharp throws, instead of failing silently", async () => {
    fetchMock.mockResolvedValue(fakeImageResponse());
    sharpMocks.stats.mockRejectedValue(new Error("unsupported image format"));
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

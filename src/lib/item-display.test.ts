import { afterEach, describe, expect, it, vi } from "vitest";

import {
  boundedRemoteImageUrl,
  getCoverImageUrls,
  getDisplayImageUrl,
  thumbStoragePath,
} from "./item-display";

const BASE = "https://ref.supabase.co/storage/v1/object/public/item-images";

describe("cover image URLs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("puts the thumbnail next to the cover", () => {
    expect(thumbStoragePath("user-1/item-1/cover.jpg")).toBe("user-1/item-1/thumb.webp");
  });

  it("uses the thumbnail for a cached cover and keeps the full image as fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");

    expect(getCoverImageUrls("user-1/item-1/cover.png", "https://example.com/a.png")).toEqual({
      src: `${BASE}/user-1/item-1/thumb.webp`,
      fallback: `${BASE}/user-1/item-1/cover.png`,
    });
  });

  it("uses the remote image with no fallback when the cover is not cached", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");

    expect(getCoverImageUrls(null, "https://example.com/a.png")).toEqual({
      src: "https://example.com/a.png",
      fallback: null,
    });
  });

  it("gives no URLs when the item has no image", () => {
    expect(getCoverImageUrls(null, null)).toBeNull();
    expect(getDisplayImageUrl(null, "javascript:alert(1)")).toBeNull();
  });

  it("asks Amazon's image CDN for a bounded copy instead of the full original", () => {
    const base = "https://m.media-amazon.com/images/M/MV5BZjE3XkEyXkFqcGc@";
    expect(boundedRemoteImageUrl(`${base}._V1_.jpg`)).toBe(`${base}._V1_UX1000_.jpg`);
    expect(getDisplayImageUrl(null, `${base}._V1_.jpg`)).toBe(`${base}._V1_UX1000_.jpg`);
    // A URL that already has size modifiers stays as it is.
    expect(boundedRemoteImageUrl(`${base}._V1_QL75_UX380_.jpg`)).toBe(`${base}._V1_QL75_UX380_.jpg`);
    expect(boundedRemoteImageUrl("https://example.com/a._V1_.jpg")).toBe("https://example.com/a._V1_.jpg");
  });
});

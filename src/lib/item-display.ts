import type { ItemCategory, Json } from "@/lib/database.types";

const ITEM_IMAGES_BUCKET = "item-images";

/** File name of the small cover copy that image caching stores next to `cover.<ext>`. */
export const COVER_THUMB_NAME = "thumb.webp";

/** Storage path of the cover thumbnail in the same folder as `coverPath`. */
export function thumbStoragePath(coverPath: string): string {
  const slash = coverPath.lastIndexOf("/");
  return `${coverPath.slice(0, slash + 1)}${COVER_THUMB_NAME}`;
}

function publicStorageUrl(path: string): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/${ITEM_IMAGES_BUCKET}/${path}` : null;
}

/**
 * Image URLs for a cover that renders small (grid, strips, tiles). `src` is the
 * cached thumbnail when the cover is cached, else the same URL as
 * `getDisplayImageUrl`. `fallback` is the full image to load when the
 * thumbnail is missing (an item cached before thumbnails existed).
 */
export function getCoverImageUrls(
  imageStoragePath: string | null | undefined,
  imageUrl: string | null | undefined,
): { src: string; fallback: string | null } | null {
  const full = getDisplayImageUrl(imageStoragePath, imageUrl);
  if (!full) return null;
  const thumb = imageStoragePath ? publicStorageUrl(thumbStoragePath(imageStoragePath)) : null;
  return thumb ? { src: thumb, fallback: full } : { src: full, fallback: null };
}

/**
 * Amazon's image CDN (IMDb posters) serves the full original for `._V1_.jpg`,
 * up to 8100x12000 px and 8 MB. Its `UX<width>` modifier returns a scaled copy.
 */
const AMAZON_FULL_SIZE = /^(https:\/\/m\.media-amazon\.com\/images\/[^?#]+?)\._V1_\.(jpe?g|png)$/i;

/** A remote image URL that asks the host for a copy at most 1000 px wide, when the host supports it. */
export function boundedRemoteImageUrl(url: string): string {
  return url.replace(AMAZON_FULL_SIZE, "$1._V1_UX1000_.$2");
}

export function getDisplayImageUrl(
  imageStoragePath: string | null | undefined,
  imageUrl: string | null | undefined,
): string | null {
  if (imageStoragePath) {
    const cached = publicStorageUrl(imageStoragePath);
    if (cached) return cached;
  }
  if (!imageUrl) return null;
  try {
    const u = new URL(imageUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return boundedRemoteImageUrl(u.href);
  } catch {
    return null;
  }
}

const DEFAULT_ASPECT_BY_CATEGORY: Record<ItemCategory, string> = {
  books: "2/3",
  movies_and_tv: "2/3",
  restaurants: "16/9",
  products: "1/1",
  travel: "16/9",
  recipes: "16/9",
  articles: "16/9",
};

export function defaultCardAspectForCategory(category: ItemCategory): string {
  return DEFAULT_ASPECT_BY_CATEGORY[category];
}

export function cardAspectRatio(category: ItemCategory | null, display: Json | null): string {
  const d =
    display && typeof display === "object" && !Array.isArray(display)
      ? (display as Record<string, unknown>)
      : {};
  const raw = d.card_aspect;
  if (typeof raw === "string" && /^\d+\/\d+$/.test(raw.trim())) {
    return raw.trim();
  }
  if (category) return defaultCardAspectForCategory(category);
  return "2/3";
}

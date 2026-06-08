import type { ItemCategory, Json } from "@/lib/database.types";

const ITEM_IMAGES_BUCKET = "item-images";

export function getDisplayImageUrl(
  imageStoragePath: string | null | undefined,
  imageUrl: string | null | undefined,
): string | null {
  if (imageStoragePath) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      return `${supabaseUrl}/storage/v1/object/public/${ITEM_IMAGES_BUCKET}/${imageStoragePath}`;
    }
  }
  if (!imageUrl) return null;
  try {
    const u = new URL(imageUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.href;
  } catch {
    return null;
  }
}

const DEFAULT_ASPECT_BY_CATEGORY: Record<ItemCategory, string> = {
  books: "2/3",
  movies_and_tv: "2/3",
  videos: "16/9",
  music: "1/1",
  restaurants: "16/9",
  products: "1/1",
  travel: "16/9",
  recipes: "16/9",
  articles: "16/9",
  apps: "1/1",
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

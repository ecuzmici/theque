import type { RecommendShelfId } from "@/lib/recommend/recommend-types";
import type { ShelfId } from "@/lib/shelves";

/**
 * How the persistent "Made for you" banner behaves on a given library shelf.
 *
 * The masthead (title + Spine Band + banner) is now shown on every shelf, so the
 * banner has to adapt its featured category to the active shelf rather than
 * always offering both recommendation categories.
 */
export type BannerMode =
  /** "All" shelf: heuristic featured category + both categories in the picker. */
  | { kind: "auto" }
  /** A recommendation category shelf: feature that one category. */
  | { kind: "featured"; shelfId: RecommendShelfId }
  /** A shelf with no recommendation category: show the banner disabled. */
  | { kind: "disabled" };

/**
 * Shelf-aware "Made for you" behaviour. The recommendation categories are Books
 * and Watch; the All shelf offers both (heuristic pick), each category shelf
 * features its own, and every other shelf (Articles, Other, Inbox, Forgotten)
 * has no recommendation category so the banner is shown disabled.
 */
export function bannerModeForShelf(shelf: ShelfId): BannerMode {
  switch (shelf) {
    case "all":
      return { kind: "auto" };
    case "books":
      return { kind: "featured", shelfId: "books" };
    case "watch":
      return { kind: "featured", shelfId: "watch" };
    default:
      return { kind: "disabled" };
  }
}

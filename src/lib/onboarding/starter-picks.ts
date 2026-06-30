import type { ItemCategory } from "@/lib/database.types";

/**
 * A tiny, hardcoded set of well-known links used to seed a brand-new, empty
 * library so the first save is one tap away and the user immediately sees real
 * enriched cards. These flow through the normal `POST /api/capture` path (no
 * faked enrichment), span the headline shelves (Books / Watch / Articles /
 * Other), and are clearly framed in the UI as deletable samples.
 *
 * Each URL was chosen because it carries a canonical entity id or solid
 * schema.org / Open Graph metadata, so deterministic enrichment fills the card
 * without depending on the optional LLM path.
 */
export type StarterPick = {
  url: string;
  /** What the user will recognise the card as, before enrichment lands. */
  title: string;
  /** Short kind label shown under the title (e.g. "Book", "Film"). */
  kind: string;
  category: ItemCategory;
};

export const STARTER_PICKS: StarterPick[] = [
  {
    url: "https://www.goodreads.com/book/show/2767052-the-hunger-games",
    title: "The Hunger Games",
    kind: "Book",
    category: "books",
  },
  {
    url: "https://www.imdb.com/title/tt0111161/",
    title: "The Shawshank Redemption",
    kind: "Film",
    category: "movies_and_tv",
  },
  {
    url: "https://waitbutwhy.com/2014/05/fermi-paradox.html",
    title: "The Fermi Paradox",
    kind: "Article",
    category: "articles",
  },
  {
    url: "https://www.seriouseats.com/the-best-chocolate-chip-cookies-recipe",
    title: "The Best Chocolate Chip Cookies",
    kind: "Recipe",
    category: "recipes",
  },
];

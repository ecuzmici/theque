import type { ItemCategory } from "@/lib/database.types";

export type DomainClassification = {
  category: ItemCategory;
  category_confidence: number;
  tier: "authoritative" | "ambiguous";
};

// Authoritative domains: strong signal, checked before schema.org.
const AUTHORITATIVE: Array<{ suffix: string; category: ItemCategory }> = [
  { suffix: "imdb.com", category: "movies_and_tv" },
  { suffix: "themoviedb.org", category: "movies_and_tv" },
  { suffix: "letterboxd.com", category: "movies_and_tv" },
  { suffix: "goodreads.com", category: "books" },
  { suffix: "storytel.com", category: "books" },
  { suffix: "etsy.com", category: "products" },
  { suffix: "airbnb.com", category: "travel" },
  { suffix: "booking.com", category: "travel" },
  { suffix: "lonelyplanet.com", category: "travel" },
  { suffix: "spotify.com", category: "music" },
  { suffix: "music.apple.com", category: "music" },
  { suffix: "bandcamp.com", category: "music" },
  { suffix: "soundcloud.com", category: "music" },
  { suffix: "github.com", category: "apps" },
  { suffix: "producthunt.com", category: "apps" },
];

// Ambiguous domains: weaker signal (0.55), checked after schema.org.
// amazon.* could be products, books, or media; yelp/tripadvisor pages vary.
// youtube is a general video platform, not necessarily a film.
const AMBIGUOUS: Array<{ suffix: string; category: ItemCategory }> = [
  { suffix: "youtube.com", category: "videos" },
  { suffix: "youtu.be", category: "videos" },
  { suffix: "amazon.com", category: "products" },
  { suffix: "amazon.co.uk", category: "products" },
  { suffix: "amazon.de", category: "products" },
  { suffix: "amazon.fr", category: "products" },
  { suffix: "amazon.ca", category: "products" },
  { suffix: "amazon.com.au", category: "products" },
  { suffix: "yelp.com", category: "restaurants" },
  { suffix: "tripadvisor.com", category: "travel" },
];

export function classifyFromDomain(hostname: string): DomainClassification | null {
  const host = hostname.toLowerCase().replace(/^www\./, "");

  for (const { suffix, category } of AUTHORITATIVE) {
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      return { category, category_confidence: 0.95, tier: "authoritative" };
    }
  }

  for (const { suffix, category } of AMBIGUOUS) {
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      return { category, category_confidence: 0.55, tier: "ambiguous" };
    }
  }

  return null;
}

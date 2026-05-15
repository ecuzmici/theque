import type { ItemCategory } from "@/lib/database.types";

export type DomainClassification = {
  category: ItemCategory;
  category_confidence: number;
};

export function classifyFromDomain(hostname: string): DomainClassification | null {
  const host = hostname.toLowerCase().replace(/^www\./, "");

  const pairs: Array<{ suffix: string; category: ItemCategory }> = [
    { suffix: "imdb.com", category: "movies_and_tv" },
    { suffix: "themoviedb.org", category: "movies_and_tv" },
    { suffix: "letterboxd.com", category: "movies_and_tv" },
    { suffix: "youtube.com", category: "movies_and_tv" },
    { suffix: "youtu.be", category: "movies_and_tv" },
    { suffix: "goodreads.com", category: "books" },
    { suffix: "storytel.com", category: "books" },
    { suffix: "amazon.com", category: "products" },
    { suffix: "amazon.co.uk", category: "products" },
    { suffix: "amazon.de", category: "products" },
    { suffix: "etsy.com", category: "products" },
    { suffix: "yelp.com", category: "restaurants" },
    { suffix: "tripadvisor.com", category: "travel" },
    { suffix: "google.com", category: "restaurants" },
    { suffix: "airbnb.com", category: "travel" },
    { suffix: "booking.com", category: "travel" },
    { suffix: "lonelyplanet.com", category: "travel" },
  ];

  for (const { suffix, category } of pairs) {
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      return { category, category_confidence: 0.95 };
    }
  }

  return null;
}

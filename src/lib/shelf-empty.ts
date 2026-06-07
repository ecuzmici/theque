import type { ShelfId } from "@/lib/shelves";

export const SHELF_EMPTY: Record<
  ShelfId,
  { title: string; description: string }
> = {
  all: {
    title: "Your library is empty",
    description: "Save something from Chrome or your phone — cards appear here as you capture links.",
  },
  books: {
    title: "No books yet",
    description: "Save a Goodreads or bookstore link and it will land on this shelf.",
  },
  watch: {
    title: "Nothing to watch",
    description: "Share a film or series from IMDb, Letterboxd, or streaming sites.",
  },
  eat: {
    title: "No restaurants saved",
    description: "Capture a Maps or Yelp link when you find a place to try.",
  },
  listen: {
    title: "Nothing to listen to",
    description: "Save albums, songs, or podcasts from Spotify, Bandcamp, and Apple Music.",
  },
  shop: {
    title: "No products saved",
    description: "Save wishlist items from Amazon, Etsy, and other shops.",
  },
  travel: {
    title: "No travel ideas",
    description: "Bookmark stays, flights, and destinations for your next trip.",
  },
  read: {
    title: "Nothing to read",
    description: "Save articles and essays — they appear here once classified.",
  },
  cook: {
    title: "No recipes yet",
    description: "Capture recipe blogs and cooking pages with schema.org Recipe data.",
  },
  tools: {
    title: "No apps or tools saved",
    description: "Save GitHub repos, Product Hunt listings, and software pages.",
  },
  inbox: {
    title: "Inbox is clear",
    description: "New captures with low confidence land here for a quick triage.",
  },
};

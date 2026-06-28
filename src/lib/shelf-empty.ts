import type { ShelfId } from "@/lib/shelves";

export const SHELF_EMPTY: Record<
  ShelfId,
  { title: string; description: string }
> = {
  all: {
    title: "Your library is empty",
    description: "Save something from Chrome or your phone. Cards show up here as you capture links.",
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
    description: "Save articles and essays. They show up here once we've sorted them.",
  },
  cook: {
    title: "No recipes yet",
    description: "Save recipe blogs and cooking pages. We'll pull in the ingredients and steps.",
  },
  forgotten: {
    title: "Nothing forgotten",
    description: "Items still wanted after six months resurface here. The shelf is clear.",
  },
  inbox: {
    title: "Inbox is clear",
    description: "Saves we couldn't sort confidently land here for a quick triage.",
  },
  done: {
    title: "Nothing done yet",
    description: "Mark something consumed from a backlog shelf and it will show up here with your verdict.",
  },
};

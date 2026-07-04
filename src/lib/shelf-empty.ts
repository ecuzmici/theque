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
  read: {
    title: "No articles yet",
    description: "Save articles and essays. They show up here once we've sorted them.",
  },
  other: {
    title: "Nothing here yet",
    description: "Restaurants, products, travel, and recipes you save land together on this shelf.",
  },
  forgotten: {
    title: "Nothing forgotten",
    description: "Items still wanted after six months resurface here. The shelf is clear.",
  },
  inbox: {
    title: "Inbox is clear",
    description: "Saves we couldn't sort confidently land here for a quick triage.",
  },
};

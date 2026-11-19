/** Registry of the idea-lab prototypes, in ranked order (best first). */
export type LabIdea = {
  slug: string;
  title: string;
  pitch: string;
  why: string;
  effort: "S" | "M" | "L";
  /** What it costs to run. Everything here is free. */
  cost: string;
};

export const LAB_IDEAS: LabIdea[] = [
  {
    slug: "series",
    title: "Series tracker",
    pitch: "Every series you are in, how far you got, and the next book to read.",
    why: "Hardcover places 80 of your 149 books in 56 series; thèque stores the series for only 42. Today the next book is a search away.",
    effort: "M",
    cost: "Free: Hardcover API",
  },
  {
    slug: "radar",
    title: "Release radar",
    pitch: "New and upcoming books by authors you rated 4 or 5 stars, and films by directors you love.",
    why: "You finish a lot of series fiction and horror. New releases from favourites are the safest picks there are.",
    effort: "M",
    cost: "Free: Hardcover and TMDB",
  },
  {
    slug: "tonight",
    title: "Tonight",
    pitch: "Say how much time you have. Get one film or book that fits, and where to stream it.",
    why: "44 films wait on your Watch shelf. Runtime and streaming services decide what you actually start.",
    effort: "S",
    cost: "Free: TMDB watch providers",
  },
  {
    slug: "scan",
    title: "Shelf scanner",
    pitch: "Point the phone at a book's barcode in a shop. See if it is already on your list, and open it on Goodreads.",
    why: "Every book now has an ISBN, so a barcode maps straight to your library.",
    effort: "S",
    cost: "Free: browser barcode API",
  },
  {
    slug: "rank",
    title: "Head to head",
    pitch: "Pick the better of two finished books, again and again, until a true top 10 falls out.",
    why: "20 of your 42 rated books have 5 stars. Stars stop telling them apart. Pairs do.",
    effort: "S",
    cost: "Free",
  },
  {
    slug: "wrapped",
    title: "Your year, wrapped",
    pitch: "A story-style recap: books and films finished, pages and hours, favourites, and the colours of your year.",
    why: "You finished 71 books and films since June, with dates, ratings and verdicts. The recap needs nothing new.",
    effort: "M",
    cost: "Free",
  },
  {
    slug: "journal",
    title: "Reading diary",
    pitch: "A calendar of what you finished, your verdicts as a timeline, and a pace line for a yearly goal.",
    why: "26 verdicts sit inside item pages where you never reread them.",
    effort: "S",
    cost: "Free",
  },
  {
    slug: "bookcase",
    title: "The bookcase",
    pitch: "Your books as spines on a shelf: colour from the cover, thickness from the page count.",
    why: "The library is a wall of covers. A shelf of spines feels like owning them.",
    effort: "S",
    cost: "Free",
  },
  {
    slug: "import",
    title: "Import your past",
    pitch: "Drop a Goodreads or Letterboxd export. See what you read and watched before thèque, with ratings.",
    why: "Your history in thèque starts in May 2026. Years of earlier ratings would feed the recommender at once.",
    effort: "M",
    cost: "Free",
  },
  {
    slug: "map",
    title: "Taste map",
    pitch: "Every item as a star: era across, your rating up. Genres form constellations.",
    why: "Shows where your taste clusters and where the empty sky is.",
    effort: "M",
    cost: "Free",
  },
  {
    slug: "cleanup",
    title: "Spring cleaning",
    pitch: "Swipe through the oldest Want items: keep, or let go. The Inbox swipe, for the backlog.",
    why: "148 books and films wait on Want, against 73 finished. A short pass keeps Up next and the recommender honest.",
    effort: "S",
    cost: "Free",
  },
  {
    slug: "ambient",
    title: "Ambient mode",
    pitch: "A slow, full-screen drift of your covers, with a favourite and your verdict now and then.",
    why: "An old tablet on the shelf, or the TV while friends are over. Your taste as a quiet screensaver.",
    effort: "S",
    cost: "Free",
  },
  {
    slug: "reader",
    title: "E-reader sync, the other way",
    pitch: "Drop KoboReader.sqlite or Kindle’s My Clippings.txt. See which books the e-reader says you finished, how long they took, and every highlight.",
    why: "112 of your items carry a Kobo file. The Kobo already knows when you finished them; thèque does not.",
    effort: "M",
    cost: "Free",
  },
];

/** Ideas that are not prototyped yet, ranked. */
export const MORE_IDEAS: Array<{ title: string; pitch: string }> = [
  {
    title: "Previously on…",
    pitch: "Before you open book 4 of a series, a spoiler-safe recap of books 1-3. About $0.01 per recap.",
  },
  {
    title: "Ask your library",
    pitch: "“That space book with the spiders.” Search by memory, not by title. Embeddings cost a fraction of a cent.",
  },
  {
    title: "Revisit",
    pitch: "Once a month, one 5-star book or film from at least two years ago, as a nudge to reread or rewatch.",
  },
  {
    title: "Radar in the digest",
    pitch: "The weekly digest email adds new releases from favourite authors and directors.",
  },
];

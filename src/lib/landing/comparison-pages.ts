import type { Metadata } from "next";

/** Canonical public origin used for absolute OG/canonical URLs. */
export const SITE_ORIGIN = "https://theque.app";

export type ComparisonRow = {
  /** Row label, e.g. "What a save looks like". */
  feature: string;
  /** How the competitor handles it. */
  them: string;
  /** How thèque handles it. */
  us: string;
};

export type ValuePoint = {
  title: string;
  detail: string;
};

export type FaqItem = {
  q: string;
  a: string;
};

export type ComparisonPageConfig = {
  /** Route slug without leading slash, e.g. "goodreads-alternative". */
  slug: string;
  /** Small pill above the headline. */
  eyebrow: string;
  /** <h1>. */
  headline: string;
  /** Lead paragraph under the headline. */
  intro: string;
  /** Column header for the competitor in the comparison table. */
  competitorName: string;
  /** Heading for the comparison table, e.g. "thèque vs. Goodreads". */
  comparisonHeading: string;
  comparison: readonly ComparisonRow[];
  /** Three short value props. */
  points: readonly ValuePoint[];
  faq: readonly FaqItem[];
  finalCtaHeading: string;
  /** <title>. */
  metaTitle: string;
  /** <meta name="description">. */
  metaDescription: string;
  /** OpenGraph title (defaults to metaTitle when omitted). */
  ogTitle?: string;
  /** OpenGraph description (defaults to metaDescription when omitted). */
  ogDescription?: string;
};

/** Build a Next `metadata` export from a page config (pure; unit-tested). */
export function buildMetadata(config: ComparisonPageConfig): Metadata {
  const path = `/${config.slug}`;
  return {
    title: config.metaTitle,
    description: config.metaDescription,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: `${SITE_ORIGIN}${path}`,
      title: config.ogTitle ?? config.metaTitle,
      description: config.ogDescription ?? config.metaDescription,
    },
  };
}

export const visualBookmarkManagerConfig: ComparisonPageConfig = {
  slug: "visual-bookmark-manager",
  eyebrow: "Visual bookmark manager",
  headline: "Bookmarks you'll actually want to open.",
  intro:
    "thèque is a visual bookmark manager for the things you mean to come back to. Every link you save becomes a cover-art card, auto-sorted onto a shelf — a library you browse, not a folder of forgotten URLs.",
  competitorName: "Browser bookmarks",
  comparisonHeading: "thèque vs. browser bookmarks",
  comparison: [
    { feature: "What a save looks like", them: "A line of text in a folder", us: "A card with cover art" },
    { feature: "Organization", them: "Folders you sort by hand", us: "Auto-sorted onto shelves" },
    { feature: "What it captures", them: "URL and page title", us: "Cover, author, rating, price" },
    { feature: "Rediscovery", them: "Buried and forgotten", us: "Browse by shelf, color, or search" },
    { feature: "Where it lives", them: "Locked to one browser", us: "Anywhere you sign in" },
    { feature: "Price", them: "Free", us: "Free" },
  ],
  points: [
    { title: "One-click save", detail: "From Chrome or your phone — no forms, no copy-paste." },
    { title: "Cards, not text", detail: "thèque reads the page and builds the cover, title, author, rating, and price." },
    { title: "Sorts itself", detail: "Each save lands on the right shelf — Books, Watch, Articles, and more." },
  ],
  faq: [
    {
      q: "What is a visual bookmark manager?",
      a: "Instead of saving a link as a line of text, a visual bookmark manager turns it into a card with cover art and key details, so your saved things look like a library you want to browse.",
    },
    {
      q: "How is it different from my browser's bookmarks?",
      a: "Browser bookmarks store a URL and a title in a folder you have to organize yourself. thèque reads the page and builds a visual card — cover, author, rating, price — then files it on the right shelf automatically.",
    },
    {
      q: "Can I save anything?",
      a: "Yes. Paste any URL, or use the Chrome extension to save the page you're on. thèque sorts books, films, articles, recipes, products, places, and travel onto their shelves.",
    },
    {
      q: "Is it free?",
      a: "Yes, free while it grows. Sign in with your email — no password, no credit card.",
    },
  ],
  finalCtaHeading: "Give your bookmarks a home you'll open",
  metaTitle: "A visual bookmark manager that builds beautiful cards | thèque",
  metaDescription:
    "thèque is a visual bookmark manager: every link you save becomes a cover-art card, auto-sorted onto a shelf. A private library you browse, not a folder of forgotten URLs. Free.",
  ogTitle: "thèque: a visual bookmark manager",
  ogDescription:
    "Stop losing links in folders. thèque turns every save into a visual card on an auto-sorted shelf. Private, no ads. Free.",
};

export const goodreadsAlternativeConfig: ComparisonPageConfig = {
  slug: "goodreads-alternative",
  eyebrow: "Goodreads alternative",
  headline: "A quieter home for the books you love.",
  intro:
    "thèque is a private Goodreads alternative — save any book by its link, get a cover card on your Books shelf, and mark it read with your own verdict. No feed, no ratings race, no ads. Just your reading life, kept for you.",
  competitorName: "Goodreads",
  comparisonHeading: "thèque vs. Goodreads",
  comparison: [
    { feature: "What it is", them: "A social reading network", us: "A private reading library" },
    { feature: "Activity feed", them: "Friends, updates, reviews", us: "None — it's just yours" },
    { feature: "Ratings", them: "Public star average", us: "Your own private verdict" },
    { feature: "Beyond books", them: "Books only", us: "Books, films, articles, and more" },
    { feature: "Ads", them: "Yes", us: "Never" },
    { feature: "Price", them: "Free, ad-supported", us: "Free" },
  ],
  points: [
    { title: "Save by link", detail: "Paste a book's page or use the extension — thèque builds the cover card." },
    { title: "Your verdict, not a crowd's", detail: "Mark a book read and keep a rating that's just for you." },
    { title: "One shelf for everything", detail: "The film you saw and the book it's based on can live side by side." },
  ],
  faq: [
    {
      q: "Why look for a Goodreads alternative?",
      a: "Some readers want to track books without a social feed, public reviews, or ads — a quiet, private shelf instead of a network. That's what thèque is.",
    },
    {
      q: "Can I import my Goodreads books?",
      a: "There's no one-click import yet. For now you can paste a book's link to save it, or use the Chrome extension as you browse.",
    },
    {
      q: "Is thèque only for books?",
      a: "No. Books get their own shelf, but thèque also keeps films and shows, articles, recipes, products, places, and travel — one private library for everything you save.",
    },
    {
      q: "Is it private and free?",
      a: "Yes. Your library is private by design, and thèque is free while it grows. Sign in with your email — no password.",
    },
  ],
  finalCtaHeading: "Keep your reading life, privately",
  metaTitle: "A private Goodreads alternative for your reading life | thèque",
  metaDescription:
    "thèque is a private Goodreads alternative: save books as cover cards on your own shelf, mark them read with your own verdict. No feed, no ads, no ratings race. Free.",
  ogTitle: "thèque: a private Goodreads alternative",
  ogDescription:
    "Track the books you love without a social feed or ads. thèque is a private, visual reading library. Free.",
};

export const letterboxdAlternativeConfig: ComparisonPageConfig = {
  slug: "letterboxd-alternative",
  eyebrow: "Letterboxd alternative · watchlist app",
  headline: "Your watchlist, beautifully kept and entirely private.",
  intro:
    "thèque is a private place to track films and shows. Save from IMDb, TMDB, or anywhere, get a poster card on your Watch shelf, and log what you've seen with your own verdict — no social feed, no activity to keep up with, no ads.",
  competitorName: "Letterboxd",
  comparisonHeading: "thèque vs. Letterboxd",
  comparison: [
    { feature: "What it is", them: "A film social network", us: "A private watchlist & library" },
    { feature: "Activity feed", them: "Reviews, likes, follows", us: "None — it's just yours" },
    { feature: "Reviews", them: "Public reviews and ratings", us: "Your own private verdict" },
    { feature: "Beyond films", them: "Films and shows only", us: "Films, books, articles, and more" },
    { feature: "Ads / upsell", them: "Pro / Patron tiers", us: "Free" },
    { feature: "Privacy", them: "Public profile by default", us: "Private by design" },
  ],
  points: [
    { title: "Save from anywhere", detail: "IMDb, TMDB, Letterboxd, a trailer — paste the link, get a poster card." },
    { title: "Watchlist that's yours", detail: "No followers, no feed — just the films you mean to watch." },
    { title: "One library, every taste", detail: "Films sit beside the books, articles, and places you save." },
  ],
  faq: [
    {
      q: "Why use thèque instead of Letterboxd?",
      a: "If you want a watchlist and a record of what you've seen — without a public profile, a social feed, or paid tiers — thèque keeps your films privately, as poster cards on your own shelf.",
    },
    {
      q: "Where can I save films from?",
      a: "Paste a link from IMDb, TMDB, Letterboxd, or most film pages, or use the Chrome extension. thèque builds the poster card and files it on your Watch shelf.",
    },
    {
      q: "Does it track shows too?",
      a: "Yes — films and TV both land on the Watch shelf, and you can mark them watched with your own verdict.",
    },
    {
      q: "Is it free and private?",
      a: "Yes. thèque is free while it grows and private by design. Sign in with your email — no password.",
    },
  ],
  finalCtaHeading: "Keep your watchlist beautifully private",
  metaTitle: "A private Letterboxd alternative & watchlist app | thèque",
  metaDescription:
    "thèque is a private Letterboxd alternative and watchlist app: save films and shows as poster cards on your own Watch shelf, log them with your own verdict. No social feed, no ads. Free.",
  ogTitle: "thèque: a private Letterboxd alternative & watchlist app",
  ogDescription:
    "Track films and shows without a public profile or feed. thèque is a private, visual watchlist. Free.",
};

export const COMPARISON_PAGES: readonly ComparisonPageConfig[] = [
  visualBookmarkManagerConfig,
  goodreadsAlternativeConfig,
  letterboxdAlternativeConfig,
] as const;

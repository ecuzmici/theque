import type { ItemCategory, Json } from "@/lib/database.types";

const GOODREADS_HOST = /(^|\.)goodreads\.com$/i;

/** Returns the ISBN with hyphens and spaces removed, or null if it is not a valid ISBN-10 or ISBN-13. */
function normalizeIsbn(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const isbn = value.replace(/[\s-]/g, "").toUpperCase();
  return /^(\d{9}[\dX]|\d{13})$/.test(isbn) ? isbn : null;
}

function firstAuthor(structured: Record<string, unknown>): string | null {
  const authors = structured.authors;
  const first = Array.isArray(authors) ? authors[0] : authors;
  return typeof first === "string" && first.trim() ? first.trim() : null;
}

/**
 * Goodreads URL for a book that the user saved from another site.
 *
 * An ISBN search opens the book page directly. Without an ISBN, the URL
 * searches for the title and the first author. Returns null when the item is
 * not a book, when the source is Goodreads, or when there is no title.
 */
export function goodreadsUrlForItem(item: {
  category: ItemCategory | null;
  domain: string;
  title: string | null;
  structured: Json | null;
}): string | null {
  if (item.category !== "books") return null;
  if (GOODREADS_HOST.test(item.domain)) return null;

  const structured =
    item.structured && typeof item.structured === "object" && !Array.isArray(item.structured)
      ? (item.structured as Record<string, unknown>)
      : {};

  const isbn = normalizeIsbn(structured.isbn);
  if (isbn) return `https://www.goodreads.com/search?q=${isbn}`;

  const title = item.title?.trim();
  if (!title) return null;
  const query = [title, firstAuthor(structured)].filter(Boolean).join(" ");
  return `https://www.goodreads.com/search?q=${encodeURIComponent(query)}`;
}

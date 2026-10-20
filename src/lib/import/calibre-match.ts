/**
 * Match books from a Calibre export to theque book items.
 *
 * Two books match when their normalized titles are equal. When both sides
 * have authors, they must also share at least one author surname. The
 * module is pure: it reads no file and makes no network or database call.
 */

export type CalibreBook = {
  calibre_id: number;
  title: string;
  authors: string[];
  identifiers: Record<string, string>;
  series: string | null;
  series_index: number | null;
  year: string | null;
  tags: string[];
  epub_path: string | null;
};

export type LibraryBook = {
  id: string;
  title: string | null;
  authors: string[];
  hasFile: boolean;
  createdAt: string;
};

export type SkipReason =
  | "no_epub"
  | "calibre_builtin"
  | "duplicate_calibre_book"
  | "item_has_file"
  | "item_already_matched";

export type SkippedBook = {
  calibreId: number;
  calibreTitle: string;
  reason: SkipReason;
  /** The item or the Calibre book that caused the skip. */
  itemId?: string;
  duplicateOf?: number;
  epubPath: string | null;
};

export type MatchedBook = { book: CalibreBook; item: LibraryBook };

export type MatchPlan = {
  matched: MatchedBook[];
  unmatched: CalibreBook[];
  skipped: SkippedBook[];
};

/** Remove trailing "(...)" and "[...]" groups, e.g. "(Series, #2)". */
function stripTrailingGroups(value: string): string {
  let current = value.trim();
  for (;;) {
    const next = current.replace(/\s*[([][^()[\]]*[)\]]\s*$/, "").trim();
    if (next === current || !next) return current;
    current = next;
  }
}

/**
 * The title without a series suffix and without a subtitle. Calibre writes
 * "_" for ":" in some titles ("Recursion_A Novel"), so "_" also starts a
 * subtitle. The result keeps its case, for display and for search queries.
 */
export function cleanBookTitle(raw: string): string {
  let value = stripTrailingGroups(raw.normalize("NFC"));
  const cut = value.search(/[:_]/);
  if (cut > 0) value = value.slice(0, cut);
  value = stripTrailingGroups(value);
  return value.trim() || raw.trim();
}

function foldWords(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’‘`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The comparison key for a book title. */
export function normalizeBookTitle(raw: string): string {
  return foldWords(cleanBookTitle(raw)).replace(/^(the|a|an)\s+/, "");
}

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "md"]);

/**
 * The last name of an author, lowercase and without accents. Calibre can
 * write "Bennett| Robert Jackson" or "Le Guin, Ursula": the part before the
 * separator then holds the last name.
 */
export function authorSurname(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const inverted = trimmed.match(/^([^|,]+)[|,]\s*(.+)$/);
  const surnamePart = inverted && !NAME_SUFFIXES.has(foldWords(inverted[2])) ? inverted[1] : trimmed;
  const tokens = foldWords(surnamePart)
    .split(" ")
    .filter((token) => token && !NAME_SUFFIXES.has(token));
  return tokens.at(-1) ?? null;
}

/** "Bennett| Robert Jackson" becomes "Robert Jackson Bennett". */
export function displayAuthorName(name: string): string {
  const inverted = name.trim().match(/^([^|]+)\|\s*(.+)$/);
  return inverted ? `${inverted[2].trim()} ${inverted[1].trim()}` : name.trim();
}

function surnames(authors: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const author of authors) {
    const surname = authorSurname(author);
    if (surname) out.add(surname);
  }
  return out;
}

/** True when either list is empty, or when the lists share a surname. */
export function authorsCompatible(a: readonly string[], b: readonly string[]): boolean {
  const left = surnames(a);
  const right = surnames(b);
  if (left.size === 0 || right.size === 0) return true;
  for (const surname of left) if (right.has(surname)) return true;
  return false;
}

export function titlesMatch(
  a: { title: string | null; authors: readonly string[] },
  b: { title: string | null; authors: readonly string[] },
): boolean {
  if (!a.title?.trim() || !b.title?.trim()) return false;
  const left = normalizeBookTitle(a.title);
  if (!left || left !== normalizeBookTitle(b.title)) return false;
  return authorsCompatible(a.authors, b.authors);
}

/** Calibre adds this guide to each new library. It is not a book. */
export function isCalibreBuiltin(book: Pick<CalibreBook, "title" | "authors">): boolean {
  return (
    normalizeBookTitle(book.title) === "quick start guide" &&
    book.authors.some((author) => authorSurname(author) === "schember")
  );
}

/** Calibre writes "0101" when it does not know the year. */
export function calibreYear(year: string | null | undefined): number | null {
  const parsed = Number.parseInt(year ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 2100 ? parsed : null;
}

/** Digits and a final "X" only. Returns null for a value that is not an ISBN-10 or ISBN-13. */
export function normalizeIsbn(raw: string | null | undefined): string | null {
  const value = (raw ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
  if (/^\d{13}$/.test(value) || /^\d{9}[\dX]$/.test(value)) return value;
  return null;
}

/** A Goodreads book id ("16131032"), or null. */
export function goodreadsId(identifiers: Record<string, string>): string | null {
  const value = identifiers.goodreads?.trim();
  return value && /^\d+$/.test(value) ? value : null;
}

/** Prefer the Calibre copy with more identifiers, then the newer copy. */
function compareCalibrePreference(a: CalibreBook, b: CalibreBook): number {
  const ids = Object.keys(b.identifiers ?? {}).length - Object.keys(a.identifiers ?? {}).length;
  return ids !== 0 ? ids : b.calibre_id - a.calibre_id;
}

/** Prefer an item with authors, then the older item. */
function compareItemPreference(a: LibraryBook, b: LibraryBook): number {
  const authors = Number(b.authors.length > 0) - Number(a.authors.length > 0);
  return authors !== 0 ? authors : a.createdAt.localeCompare(b.createdAt);
}

function skip(book: CalibreBook, reason: SkipReason, extra: Partial<SkippedBook> = {}): SkippedBook {
  return { calibreId: book.calibre_id, calibreTitle: book.title, reason, epubPath: book.epub_path, ...extra };
}

/**
 * Sort Calibre books into matched, unmatched and skipped. A book without an
 * EPUB, the Calibre guide and a second copy of one book are skipped. Each
 * item receives at most one book. An item that already holds a file is
 * skipped, so a later upload does not replace it.
 */
export function planCalibreMatches(books: readonly CalibreBook[], items: readonly LibraryBook[]): MatchPlan {
  const skipped: SkippedBook[] = [];
  const candidates: CalibreBook[] = [];
  for (const book of books) {
    if (!book.epub_path) skipped.push(skip(book, "no_epub"));
    else if (isCalibreBuiltin(book)) skipped.push(skip(book, "calibre_builtin"));
    else candidates.push(book);
  }

  const kept: CalibreBook[] = [];
  for (const book of [...candidates].sort(compareCalibrePreference)) {
    const original = kept.find((other) => titlesMatch(other, book));
    if (original) skipped.push(skip(book, "duplicate_calibre_book", { duplicateOf: original.calibre_id }));
    else kept.push(book);
  }

  const matched: MatchedBook[] = [];
  const unmatched: CalibreBook[] = [];
  const usedItems = new Set<string>();
  for (const book of kept.sort((a, b) => a.title.localeCompare(b.title))) {
    const item = items.filter((candidate) => titlesMatch(book, candidate)).sort(compareItemPreference)[0];
    if (!item) unmatched.push(book);
    else if (usedItems.has(item.id)) skipped.push(skip(book, "item_already_matched", { itemId: item.id }));
    else if (item.hasFile) {
      usedItems.add(item.id);
      skipped.push(skip(book, "item_has_file", { itemId: item.id }));
    } else {
      usedItems.add(item.id);
      matched.push({ book, item });
    }
  }

  return { matched, unmatched, skipped };
}

export type OpenLibraryDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
};

/**
 * The first Open Library search result whose title matches the book and
 * whose authors share a surname with the book. Returns null when no result
 * has a work key.
 */
export function pickOpenLibraryDoc(
  docs: readonly OpenLibraryDoc[],
  book: { title: string; authors: readonly string[] },
): (OpenLibraryDoc & { key: string }) | null {
  for (const doc of docs) {
    if (!doc.key || !/^\/works\/OL\d+W$/.test(doc.key) || !doc.title) continue;
    if (titlesMatch(book, { title: doc.title, authors: doc.author_name ?? [] })) {
      return doc as OpenLibraryDoc & { key: string };
    }
  }
  return null;
}

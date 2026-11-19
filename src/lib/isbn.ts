/**
 * ISBN helpers shared by enrichment, the backfill script, and the Goodreads
 * link. Pure module: no I/O.
 */

function isbn10ChecksumOk(isbn: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const char = isbn[i]!;
    const digit = char === "X" ? 10 : Number(char);
    sum += digit * (10 - i);
  }
  return sum % 11 === 0;
}

function isbn13ChecksumOk(isbn: string): boolean {
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}

/**
 * Returns the ISBN without hyphens or spaces, with an upper-case X, or null
 * when the value is not an ISBN-10 or ISBN-13 with a correct check digit.
 */
export function normalizeIsbn(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const isbn = String(value).replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) return isbn10ChecksumOk(isbn) ? isbn : null;
  if (/^97[89]\d{10}$/.test(isbn)) return isbn13ChecksumOk(isbn) ? isbn : null;
  return null;
}

/** First valid ISBN in the list, in list order. */
export function firstValidIsbn(values: unknown[]): string | null {
  for (const value of values) {
    const isbn = normalizeIsbn(value);
    if (isbn) return isbn;
  }
  return null;
}

/**
 * True for an ISBN from the English-language registration groups: 978-0,
 * 978-1, and 979-8 (USA). Catalogue language tags are not reliable (Hardcover
 * tags a Romanian edition of Scythe as English), but the ISBN prefix is.
 */
export function isEnglishGroupIsbn(value: unknown): boolean {
  const isbn = normalizeIsbn(value);
  if (!isbn) return false;
  if (isbn.length === 10) return isbn.startsWith("0") || isbn.startsWith("1");
  return isbn.startsWith("9780") || isbn.startsWith("9781") || isbn.startsWith("9798");
}

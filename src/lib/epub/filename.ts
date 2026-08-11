/** A plain EPUB. A Kobo opens it, but it shows a placeholder instead of the cover. */
export const EPUB_EXTENSION = ".epub";
/** A converted EPUB. The device reads the cover only from this format. */
export const KEPUB_EXTENSION = ".kepub.epub";

const MAX_LENGTH = 120;
const FALLBACK_TITLE = "Untitled";
const PLACEHOLDER = "_";

/**
 * A shorter title carries no meaning. The builder then cuts the whole name
 * instead, so a long author or series name cannot hide the book.
 */
const MIN_TITLE_LENGTH = 8;

/** FAT32 and exFAT reject these. A Kobo mounts over USB with those filesystems. */
const ILLEGAL_PATTERN = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/**
 * NFKD keeps these characters as they are, so map them by hand.
 * The typographic entries come last. Book titles use them often, and a
 * placeholder inside a word is harder to read than the plain character.
 */
const ASCII_MAP: Record<string, string> = {
  "ø": "o",
  "Ø": "O",
  "đ": "d",
  "Đ": "D",
  "ł": "l",
  "Ł": "L",
  "æ": "ae",
  "Æ": "AE",
  "œ": "oe",
  "Œ": "OE",
  "ß": "ss",
  "þ": "th",
  "Þ": "Th",
  "ð": "d",
  "Ð": "D",
  "‘": "'",
  "’": "'",
  "‚": "'",
  "“": "'",
  "”": "'",
  "„": "'",
  "«": "'",
  "»": "'",
  "–": "-",
  "—": "-",
};

const ASCII_MAP_PATTERN = new RegExp(`[${Object.keys(ASCII_MAP).join("")}]`, "gu");

export type KoboFilenameInput = {
  title: string | null;
  authors?: string[] | null;
  series?: string | null;
  seriesIndex?: number | null;
};

/**
 * Make one field safe for a flat Kobo folder.
 * The steps run in this order because each one makes work for the next.
 */
function clean(value: unknown): string {
  if (typeof value !== "string" || value === "") return "";

  return (
    value
      .replace(ASCII_MAP_PATTERN, (character) => ASCII_MAP[character])
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      // Turn each space, tab and line break into one space before the next step
      // deletes the control characters. Otherwise two words become one word.
      .replace(/\s+/gu, " ")
      .replace(ILLEGAL_PATTERN, "")
      // Keep a mark for what stays. A silent drop lets two different books
      // share one filename.
      .replace(/[^\x20-\x7e]/gu, PLACEHOLDER)
      .replace(/_+/g, PLACEHOLDER)
      .replace(/ {2,}/g, " ")
      .replace(/^[\s.]+/, "")
      .replace(/[\s.]+$/, "")
  );
}

function firstAuthor(authors: string[] | null | undefined): string {
  if (!Array.isArray(authors)) return "";
  for (const author of authors) {
    const cleaned = clean(author);
    if (cleaned) return cleaned;
  }
  return "";
}

/**
 * Pad the whole part to two digits, because 02 must sort before 10.
 * A fraction stays, because 01.5 sorts between 01 and 02.
 * An index that prints in exponent form cannot sort, so drop it.
 */
function formatIndex(index: number | null | undefined): string {
  if (typeof index !== "number" || !Number.isFinite(index) || index <= 0) return "";

  const text = String(index);
  if (!/^\d+(\.\d+)?$/.test(text)) return "";

  const [whole, fraction] = text.split(".");
  const padded = whole.padStart(2, "0");
  return fraction ? `${padded}.${fraction}` : padded;
}

function buildSuffix(series: string, index: string): string {
  if (!series) return "";
  return index ? ` (${series} ${index})` : ` (${series})`;
}

/** A name must not end with a separator, a space or a dot. */
function trimEnd(value: string): string {
  return value.replace(/[\s.,;:-]+$/, "");
}

/** Cut on a word boundary when one sits near the limit, else cut hard. */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;

  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return trimEnd(space >= Math.ceil(max / 2) ? cut.slice(0, space) : cut);
}

function build(input: KoboFilenameInput, extension: string): string {
  const author = firstAuthor(input.authors);
  const suffix = buildSuffix(clean(input.series), formatIndex(input.seriesIndex));
  const title = clean(input.title) || FALLBACK_TITLE;

  const head = author ? `${author} - ` : "";
  // The extension eats into the 120 characters, and `.kepub.epub` is six
  // characters longer than `.epub`. Cut the title first, as before.
  const budget = MAX_LENGTH - extension.length - head.length - suffix.length;
  const body =
    budget >= MIN_TITLE_LENGTH
      ? `${head}${truncate(title, budget)}${suffix}`
      : trimEnd(`${head}${title}${suffix}`.slice(0, MAX_LENGTH - extension.length));

  return `${trimEnd(body) || FALLBACK_TITLE}${extension}`;
}

/**
 * Build the filename for one book in the flat Drive folder that a Kobo syncs.
 * The shape is `Author - Title (Series 02).kepub.epub`. The author part and the
 * series part drop out when the book has no such value.
 * The result holds 120 characters at most, and the function never throws.
 *
 * Pass KEPUB_EXTENSION for a converted file. The device reads a `.epub` name as
 * a plain EPUB, whatever the file holds, so the name must match the format.
 */
export function buildKoboFilename(input: KoboFilenameInput, extension: string = EPUB_EXTENSION): string {
  // A caller with a bad extension must still get a name a Kobo can open.
  const safe = typeof extension === "string" && extension.startsWith(".") ? extension : EPUB_EXTENSION;
  try {
    return build(input, safe);
  } catch {
    // The caller uploads a file with this name. One bad field must not stop it.
    return `${FALLBACK_TITLE}${safe}`;
  }
}

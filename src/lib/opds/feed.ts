// OPDS 1.2 catalog for KOReader (docs/kindle-opds.md). Pure functions only:
// the routes under src/app/opds load the rows and send the XML this file builds.

import type { Json } from "@/lib/database.types";
import { cleanDisplayTitle } from "@/lib/display-title";
import {
  BOOK_GENRES,
  type BookGenreKey,
  genreLabel,
  moodLabel,
  MOODS,
  type MoodKey,
} from "@/lib/taste/taste-lists";

export const OPDS_NAVIGATION_TYPE = "application/atom+xml;profile=opds-catalog;kind=navigation";
export const OPDS_ACQUISITION_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";
export const EPUB_TYPE = "application/epub+zip";

const ACQUISITION_REL = "http://opds-spec.org/acquisition";
const IMAGE_REL = "http://opds-spec.org/image";
const THUMBNAIL_REL = "http://opds-spec.org/image/thumbnail";
const GENRE_SCHEME = "urn:theque:genre";
const MOOD_SCHEME = "urn:theque:mood";

/** Vercel caps a function response that is not streamed at 4.5 MB. */
export const DOWNLOAD_CHUNK_BYTES = 256 * 1024;

/** The item columns the catalog reads. */
export type OpdsBookRow = {
  id: string;
  title: string | null;
  description: string | null;
  structured: Json;
  image_url: string | null;
  genre_keys: string[] | null;
  mood_keys: string[] | null;
  status: string;
  created_at: string;
  updated_at: string;
  file_uploaded_at: string | null;
};

export const OPDS_BOOK_COLUMNS =
  "id, title, description, structured, image_url, genre_keys, mood_keys, status, created_at, updated_at, file_uploaded_at";

export type OpdsShelf = "up-next" | "finished" | "all";

export type OpdsBookQuery = {
  shelf: OpdsShelf;
  mood: MoodKey | null;
  genre: BookGenreKey | null;
};

// ---------------------------------------------------------------------------
// XML

/** XML 1.0 rejects most control characters, even as escapes. Drop them. */
const INVALID_XML_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;

/** Escape text for an XML element or a double-quoted attribute. */
export function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type Link = { rel: string; href: string; type?: string };

function linkXml(link: Link): string {
  const type = link.type ? ` type="${escapeXml(link.type)}"` : "";
  return `<link rel="${escapeXml(link.rel)}" href="${escapeXml(link.href)}"${type}/>`;
}

export type FeedHeader = {
  id: string;
  title: string;
  updated: string;
  /** Absolute URL of this feed. */
  self: string;
  /** Absolute URL of the root feed. */
  start: string;
  /** Absolute URL of the parent feed. The root feed has none. */
  up?: string;
};

function feedXml(header: FeedHeader, selfType: string, entries: string[]): string {
  const links = [
    linkXml({ rel: "self", href: header.self, type: selfType }),
    linkXml({ rel: "start", href: header.start, type: OPDS_NAVIGATION_TYPE }),
    ...(header.up ? [linkXml({ rel: "up", href: header.up, type: OPDS_NAVIGATION_TYPE })] : []),
  ];
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">`,
    `<id>${escapeXml(header.id)}</id>`,
    `<title>${escapeXml(header.title)}</title>`,
    `<updated>${escapeXml(header.updated)}</updated>`,
    `<author><name>theque</name></author>`,
    ...links,
    ...entries,
    `</feed>`,
  ].join("\n");
}

export type NavigationEntry = {
  id: string;
  title: string;
  /** Absolute URL of the target feed. */
  href: string;
  /** The kind of the target feed. */
  kind: "navigation" | "acquisition";
  content?: string;
};

function navigationEntryXml(entry: NavigationEntry, updated: string): string {
  const type = entry.kind === "navigation" ? OPDS_NAVIGATION_TYPE : OPDS_ACQUISITION_TYPE;
  return [
    `<entry>`,
    `<title>${escapeXml(entry.title)}</title>`,
    `<id>${escapeXml(entry.id)}</id>`,
    `<updated>${escapeXml(updated)}</updated>`,
    ...(entry.content ? [`<content type="text">${escapeXml(entry.content)}</content>`] : []),
    linkXml({ rel: "subsection", href: entry.href, type }),
    `</entry>`,
  ].join("\n");
}

export function navigationFeed(header: FeedHeader, entries: NavigationEntry[]): string {
  return feedXml(
    header,
    OPDS_NAVIGATION_TYPE,
    entries.map((entry) => navigationEntryXml(entry, header.updated)),
  );
}

export type BookEntry = {
  id: string;
  title: string;
  authors: string[];
  summary: string | null;
  updated: string;
  /** Genre labels and `Mood: <Label>` entries, the same values as the EPUB subjects. */
  categories: { scheme: string; label: string }[];
  /** Absolute cover URL, or null. */
  cover: { href: string; type: string } | null;
  /** Absolute URL of the file route. */
  acquisition: string;
};

function bookEntryXml(entry: BookEntry): string {
  return [
    `<entry>`,
    `<title>${escapeXml(entry.title)}</title>`,
    `<id>${escapeXml(entry.id)}</id>`,
    `<updated>${escapeXml(entry.updated)}</updated>`,
    ...entry.authors.map((name) => `<author><name>${escapeXml(name)}</name></author>`),
    ...(entry.summary ? [`<summary type="text">${escapeXml(entry.summary)}</summary>`] : []),
    ...entry.categories.map(
      (category) =>
        `<category scheme="${escapeXml(category.scheme)}" term="${escapeXml(category.label)}" label="${escapeXml(category.label)}"/>`,
    ),
    // The acquisition link comes first. An entry carries no navigation link,
    // because the KOReader sync mode would follow it.
    linkXml({ rel: ACQUISITION_REL, href: entry.acquisition, type: EPUB_TYPE }),
    ...(entry.cover
      ? [
          linkXml({ rel: IMAGE_REL, href: entry.cover.href, type: entry.cover.type }),
          linkXml({ rel: THUMBNAIL_REL, href: entry.cover.href, type: entry.cover.type }),
        ]
      : []),
    `</entry>`,
  ].join("\n");
}

export function acquisitionFeed(header: FeedHeader, entries: BookEntry[]): string {
  return feedXml(header, OPDS_ACQUISITION_TYPE, entries.map(bookEntryXml));
}

// ---------------------------------------------------------------------------
// Rows to entries

function asRecord(value: Json): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function authorsOf(structured: Json): string[] {
  const authors = asRecord(structured).authors;
  if (!Array.isArray(authors)) return [];
  const out: string[] = [];
  for (const author of authors) {
    const name = typeof author === "string" ? author.trim() : "";
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export function displayTitleOf(row: Pick<OpdsBookRow, "title">): string {
  const title = row.title?.trim();
  return title ? cleanDisplayTitle(title) : "Untitled";
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/** Keep an http or https cover only. Guess the type from the extension; most covers are JPEG. */
function coverOf(imageUrl: string | null, origin: string): BookEntry["cover"] {
  if (!imageUrl?.trim()) return null;
  let url: URL;
  try {
    url = new URL(imageUrl.trim(), origin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const extension = /\.([a-z0-9]+)$/i.exec(url.pathname)?.[1]?.toLowerCase() ?? "";
  return { href: url.toString(), type: IMAGE_TYPES[extension] ?? "image/jpeg" };
}

function categoriesOf(row: OpdsBookRow): BookEntry["categories"] {
  const out: BookEntry["categories"] = [];
  for (const key of row.genre_keys ?? []) {
    const label = genreLabel("books", key);
    if (label) out.push({ scheme: GENRE_SCHEME, label });
  }
  for (const key of row.mood_keys ?? []) {
    const label = moodLabel(key);
    if (label) out.push({ scheme: MOOD_SCHEME, label: `Mood: ${label}` });
  }
  return out;
}

export function bookEntryFromRow(row: OpdsBookRow, origin: string): BookEntry {
  return {
    id: `urn:theque:item:${row.id}`,
    title: displayTitleOf(row),
    authors: authorsOf(row.structured),
    summary: row.description?.trim() || null,
    updated: row.updated_at,
    categories: categoriesOf(row),
    cover: coverOf(row.image_url, origin),
    acquisition: `${origin}/opds/file/${encodeURIComponent(row.id)}`,
  };
}

// ---------------------------------------------------------------------------
// Queries and feeds

const SHELVES: Record<OpdsShelf, string> = {
  "up-next": "Up next",
  finished: "Finished",
  all: "All books",
};

const NEW_TITLE = "New on theque";

function isShelf(value: string): value is OpdsShelf {
  return value in SHELVES;
}

/** Read `shelf`, `mood` and `genre`. Return null for an unknown value. */
export function parseBookQuery(params: URLSearchParams): OpdsBookQuery | null {
  const shelf = params.get("shelf") ?? "all";
  if (!isShelf(shelf)) return null;

  const mood = params.get("mood");
  const genre = params.get("genre");
  const moodKey = mood ? MOODS.find((m) => m.key === mood)?.key : null;
  const genreKey = genre ? BOOK_GENRES.find((g) => g.key === genre)?.key : null;
  if (moodKey === undefined || genreKey === undefined) return null;

  return { shelf, mood: moodKey, genre: genreKey };
}

/** A dismissed book is out of the library, so the catalog never shows it. */
function isListed(row: OpdsBookRow): boolean {
  return row.status !== "dismissed";
}

/** Filter and order the rows for one acquisition feed. */
export function selectBooks(rows: OpdsBookRow[], query: OpdsBookQuery): OpdsBookRow[] {
  const picked = rows.filter((row) => {
    if (!isListed(row)) return false;
    if (query.shelf === "up-next" && row.status === "done") return false;
    if (query.shelf === "finished" && row.status !== "done") return false;
    if (query.mood && !(row.mood_keys ?? []).includes(query.mood)) return false;
    if (query.genre && !(row.genre_keys ?? []).includes(query.genre)) return false;
    return true;
  });

  if (query.shelf === "up-next") {
    // Newest first. ISO timestamps sort as strings.
    return picked.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return picked.sort((a, b) =>
    displayTitleOf(a).localeCompare(displayTitleOf(b), "en", { sensitivity: "base" }),
  );
}

/**
 * Every book that has a file, newest upload first, with no shelf filter.
 * KOReader "Sync catalog" mode reads from the top until it meets the href it
 * saved at the previous sync, so the order and the hrefs must stay stable.
 */
export function selectNewBooks(rows: OpdsBookRow[]): OpdsBookRow[] {
  return [...rows].sort((a, b) => {
    const byUpload = (b.file_uploaded_at ?? "").localeCompare(a.file_uploaded_at ?? "");
    return byUpload !== 0 ? byUpload : b.id.localeCompare(a.id);
  });
}

function countLabel(count: number): string {
  return count === 1 ? "1 book" : `${count} books`;
}

function bookQueryHref(origin: string, query: Partial<OpdsBookQuery>): string {
  const params = new URLSearchParams({ shelf: query.shelf ?? "all" });
  if (query.mood) params.set("mood", query.mood);
  if (query.genre) params.set("genre", query.genre);
  return `${origin}/opds/books?${params.toString()}`;
}

export function rootFeed(rows: OpdsBookRow[], origin: string, updated: string): string {
  const count = (shelf: OpdsShelf) => selectBooks(rows, { shelf, mood: null, genre: null }).length;
  return navigationFeed(
    { id: "urn:theque:opds:root", title: "theque", updated, self: `${origin}/opds`, start: `${origin}/opds` },
    [
      {
        id: "urn:theque:opds:up-next",
        title: SHELVES["up-next"],
        href: bookQueryHref(origin, { shelf: "up-next" }),
        kind: "acquisition",
        content: countLabel(count("up-next")),
      },
      {
        id: "urn:theque:opds:moods",
        title: "By mood",
        href: `${origin}/opds/moods`,
        kind: "navigation",
        content: "Books grouped by mood",
      },
      {
        id: "urn:theque:opds:genres",
        title: "By genre",
        href: `${origin}/opds/genres`,
        kind: "navigation",
        content: "Books grouped by genre",
      },
      {
        id: "urn:theque:opds:finished",
        title: SHELVES.finished,
        href: bookQueryHref(origin, { shelf: "finished" }),
        kind: "acquisition",
        content: countLabel(count("finished")),
      },
      {
        id: "urn:theque:opds:all",
        title: SHELVES.all,
        href: bookQueryHref(origin, { shelf: "all" }),
        kind: "acquisition",
        content: countLabel(count("all")),
      },
      {
        id: "urn:theque:opds:new",
        title: NEW_TITLE,
        href: `${origin}/opds/new`,
        kind: "acquisition",
        content: "Newest uploads first. Use this feed as the KOReader sync catalog.",
      },
    ],
  );
}

/** The feed for KOReader "Sync catalog" mode. See selectNewBooks. */
export function newBooksFeed(rows: OpdsBookRow[], origin: string, updated: string): string {
  return acquisitionFeed(
    {
      id: "urn:theque:opds:new",
      title: NEW_TITLE,
      updated,
      self: `${origin}/opds/new`,
      start: `${origin}/opds`,
      up: `${origin}/opds`,
    },
    selectNewBooks(rows).map((row) => bookEntryFromRow(row, origin)),
  );
}

/** The navigation feed of moods or genres. A key with no book stays out. */
export function tasteFeed(
  kind: "mood" | "genre",
  rows: OpdsBookRow[],
  origin: string,
  updated: string,
): string {
  const list = kind === "mood" ? MOODS : BOOK_GENRES;
  const path = kind === "mood" ? "moods" : "genres";
  const entries: NavigationEntry[] = [];

  for (const { key, label } of list) {
    const query: OpdsBookQuery =
      kind === "mood"
        ? { shelf: "all", mood: key as MoodKey, genre: null }
        : { shelf: "all", mood: null, genre: key as BookGenreKey };
    const count = selectBooks(rows, query).length;
    if (count === 0) continue;
    entries.push({
      id: `urn:theque:opds:${kind}:${key}`,
      title: label,
      href: bookQueryHref(origin, query),
      kind: "acquisition",
      content: countLabel(count),
    });
  }

  return navigationFeed(
    {
      id: `urn:theque:opds:${path}`,
      title: kind === "mood" ? "By mood" : "By genre",
      updated,
      self: `${origin}/opds/${path}`,
      start: `${origin}/opds`,
      up: `${origin}/opds`,
    },
    entries,
  );
}

function bookFeedTitle(query: OpdsBookQuery): string {
  if (query.mood) return `Mood: ${moodLabel(query.mood) ?? query.mood}`;
  if (query.genre) return genreLabel("books", query.genre) ?? query.genre;
  return SHELVES[query.shelf];
}

export function booksFeed(rows: OpdsBookRow[], query: OpdsBookQuery, origin: string, updated: string): string {
  const up = query.mood
    ? `${origin}/opds/moods`
    : query.genre
      ? `${origin}/opds/genres`
      : `${origin}/opds`;
  const idParts = [query.shelf, query.mood && `mood:${query.mood}`, query.genre && `genre:${query.genre}`];

  return acquisitionFeed(
    {
      id: `urn:theque:opds:books:${idParts.filter(Boolean).join(":")}`,
      title: bookFeedTitle(query),
      updated,
      self: bookQueryHref(origin, query),
      start: `${origin}/opds`,
      up,
    },
    selectBooks(rows, query).map((row) => bookEntryFromRow(row, origin)),
  );
}

// ---------------------------------------------------------------------------
// HTTP helpers

/**
 * Read the password from an HTTP Basic header. KOReader sends the capture token
 * as the password. The username can hold anything, so this ignores it.
 */
export function parseBasicAuthPassword(header: string | null): string | null {
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header?.trim() ?? "");
  if (!match) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return null;
  }

  const colon = decoded.indexOf(":");
  if (colon === -1) return null;
  return decoded.slice(colon + 1).trim() || null;
}

/** A KEPUB file belongs to a Kobo user. The catalog serves it as stored. */
export function isKepubFileName(name: string | null): boolean {
  return /\.kepub\.epub$/i.test(name?.trim() ?? "");
}

/** `attachment` with an ASCII fallback name and the RFC 5987 UTF-8 name. */
export function contentDisposition(fileName: string | null): string {
  const name = fileName?.trim() || "book.epub";
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Send the bytes in chunks, so the platform streams the body. */
export function byteStream(bytes: Uint8Array, chunkBytes = DOWNLOAD_CHUNK_BYTES): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkBytes, bytes.byteLength);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
  });
}

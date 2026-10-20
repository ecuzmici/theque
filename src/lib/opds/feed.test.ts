// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  bookEntryFromRow,
  booksFeed,
  byteStream,
  contentDisposition,
  escapeXml,
  isKepubFileName,
  newBooksFeed,
  type OpdsBookRow,
  parseBasicAuthPassword,
  parseBookQuery,
  rootFeed,
  selectBooks,
  selectNewBooks,
  tasteFeed,
} from "@/lib/opds/feed";

const ORIGIN = "https://theque.app";
const NOW = "2026-10-21T20:00:00.000Z";

function row(overrides: Partial<OpdsBookRow> = {}): OpdsBookRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Piranesi",
    description: null,
    structured: {},
    image_url: null,
    genre_keys: [],
    mood_keys: [],
    status: "want",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-02T00:00:00.000Z",
    file_uploaded_at: "2026-10-03T00:00:00.000Z",
    ...overrides,
  };
}

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

describe("escapeXml", () => {
  it("escapes the five XML characters", () => {
    expect(escapeXml(`Tom & Jerry <"x"> 'y'`)).toBe("Tom &amp; Jerry &lt;&quot;x&quot;&gt; &apos;y&apos;");
  });

  it("drops control characters that XML 1.0 rejects", () => {
    expect(escapeXml("a\u0000b\u0007c\td\ne")).toBe("abc\td\ne");
  });
});

describe("parseBasicAuthPassword", () => {
  it("returns the password and ignores the username", () => {
    expect(parseBasicAuthPassword(basic("anything", "bmly_secret"))).toBe("bmly_secret");
    expect(parseBasicAuthPassword(basic("", "bmly_secret"))).toBe("bmly_secret");
  });

  it("keeps a colon inside the password", () => {
    expect(parseBasicAuthPassword(basic("me", "a:b"))).toBe("a:b");
  });

  it("accepts a lowercase scheme", () => {
    expect(parseBasicAuthPassword(basic("me", "tok").replace("Basic", "basic"))).toBe("tok");
  });

  it("rejects a missing or malformed header", () => {
    expect(parseBasicAuthPassword(null)).toBeNull();
    expect(parseBasicAuthPassword("Bearer bmly_secret")).toBeNull();
    expect(parseBasicAuthPassword("Basic !!!")).toBeNull();
    expect(parseBasicAuthPassword(`Basic ${Buffer.from("no-colon").toString("base64")}`)).toBeNull();
    expect(parseBasicAuthPassword(basic("me", "  "))).toBeNull();
  });
});

describe("parseBookQuery", () => {
  it("reads a shelf, a mood and a genre", () => {
    expect(parseBookQuery(new URLSearchParams("shelf=up-next&mood=cozy&genre=fantasy"))).toEqual({
      shelf: "up-next",
      mood: "cozy",
      genre: "fantasy",
    });
  });

  it("defaults to all books", () => {
    expect(parseBookQuery(new URLSearchParams(""))).toEqual({ shelf: "all", mood: null, genre: null });
  });

  it("rejects an unknown shelf, mood or genre", () => {
    expect(parseBookQuery(new URLSearchParams("shelf=nope"))).toBeNull();
    expect(parseBookQuery(new URLSearchParams("mood=sad"))).toBeNull();
    // A watch genre is not a book genre.
    expect(parseBookQuery(new URLSearchParams("genre=comedy"))).toBeNull();
  });
});

describe("selectBooks", () => {
  const rows = [
    row({ id: "a", title: "b Book", status: "want", created_at: "2026-01-01T00:00:00Z", mood_keys: ["cozy"] }),
    row({ id: "b", title: "A Book", status: "inbox", created_at: "2026-03-01T00:00:00Z", genre_keys: ["fantasy"] }),
    row({ id: "c", title: "C Book", status: "done", created_at: "2026-02-01T00:00:00Z", mood_keys: ["cozy"] }),
    row({ id: "d", title: "D Book", status: "dismissed", mood_keys: ["cozy"] }),
  ];

  it("orders up next by newest first and leaves out done books", () => {
    expect(selectBooks(rows, { shelf: "up-next", mood: null, genre: null }).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("orders the other shelves by title", () => {
    expect(selectBooks(rows, { shelf: "all", mood: null, genre: null }).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(selectBooks(rows, { shelf: "finished", mood: null, genre: null }).map((r) => r.id)).toEqual(["c"]);
  });

  it("filters by mood and genre and never lists a dismissed book", () => {
    expect(selectBooks(rows, { shelf: "all", mood: "cozy", genre: null }).map((r) => r.id)).toEqual(["a", "c"]);
    expect(selectBooks(rows, { shelf: "all", mood: null, genre: "fantasy" }).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("bookEntryFromRow and booksFeed", () => {
  const book = row({
    title: "The Tainted Cup (Ana and Din Mysteries, #1)",
    description: "A murder & a mystery.",
    structured: { authors: ["Robert Jackson Bennett"] },
    image_url: "https://images.example.com/cover.png?x=1&y=2",
    genre_keys: ["mystery-crime", "nope"],
    mood_keys: ["tense"],
  });

  it("maps the row onto an entry", () => {
    expect(bookEntryFromRow(book, ORIGIN)).toEqual({
      id: "urn:theque:item:11111111-1111-1111-1111-111111111111",
      title: "The Tainted Cup",
      authors: ["Robert Jackson Bennett"],
      summary: "A murder & a mystery.",
      updated: "2026-10-02T00:00:00.000Z",
      categories: [
        { scheme: "urn:theque:genre", label: "Mystery & Crime" },
        { scheme: "urn:theque:mood", label: "Mood: Tense" },
      ],
      cover: { href: "https://images.example.com/cover.png?x=1&y=2", type: "image/png" },
      acquisition: "https://theque.app/opds/file/11111111-1111-1111-1111-111111111111",
    });
  });

  it("drops a cover that is not http or https", () => {
    expect(bookEntryFromRow(row({ image_url: "data:image/png;base64,AAAA" }), ORIGIN).cover).toBeNull();
  });

  it("builds an acquisition feed with escaped links", () => {
    const xml = booksFeed([book], { shelf: "all", mood: "tense", genre: null }, ORIGIN, NOW);

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<title>Mood: Tense</title>");
    expect(xml).toContain(
      '<link rel="self" href="https://theque.app/opds/books?shelf=all&amp;mood=tense" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>',
    );
    expect(xml).toContain(
      '<link rel="up" href="https://theque.app/opds/moods" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>',
    );
    expect(xml).toContain(
      '<link rel="http://opds-spec.org/acquisition" href="https://theque.app/opds/file/11111111-1111-1111-1111-111111111111" type="application/epub+zip"/>',
    );
    expect(xml).toContain(
      '<link rel="http://opds-spec.org/image" href="https://images.example.com/cover.png?x=1&amp;y=2" type="image/png"/>',
    );
    expect(xml).toContain('rel="http://opds-spec.org/image/thumbnail"');
    expect(xml).toContain("<author><name>Robert Jackson Bennett</name></author>");
    expect(xml).toContain('<summary type="text">A murder &amp; a mystery.</summary>');
    expect(xml).toContain('<category scheme="urn:theque:genre" term="Mystery &amp; Crime" label="Mystery &amp; Crime"/>');
    expect(xml).not.toContain("& ");
  });
});

describe("navigation feeds", () => {
  const rows = [
    row({ id: "a", mood_keys: ["cozy"], genre_keys: ["fantasy"] }),
    row({ id: "b", mood_keys: ["cozy"], status: "done" }),
    row({ id: "c", mood_keys: ["dark"], status: "dismissed" }),
  ];

  it("links the five root entries with the right feed kinds", () => {
    const xml = rootFeed(rows, ORIGIN, NOW);

    for (const title of ["Up next", "By mood", "By genre", "Finished", "All books", "New on theque"]) {
      expect(xml).toContain(`<title>${title}</title>`);
    }
    expect(xml).toContain(
      '<link rel="subsection" href="https://theque.app/opds/new" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>',
    );
    expect(xml).toContain(
      '<link rel="subsection" href="https://theque.app/opds/books?shelf=up-next" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>',
    );
    expect(xml).toContain(
      '<link rel="subsection" href="https://theque.app/opds/moods" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>',
    );
    expect(xml).toContain('<link rel="start" href="https://theque.app/opds"');
    expect(xml).not.toContain('rel="up"');
  });

  it("lists only moods with a book, with the count", () => {
    const xml = tasteFeed("mood", rows, ORIGIN, NOW);

    expect(xml).toContain("<title>Cozy</title>");
    expect(xml).toContain('<content type="text">2 books</content>');
    expect(xml).toContain('href="https://theque.app/opds/books?shelf=all&amp;mood=cozy"');
    // The only dark book is dismissed.
    expect(xml).not.toContain("<title>Dark</title>");
  });

  it("lists only genres with a book", () => {
    const xml = tasteFeed("genre", rows, ORIGIN, NOW);

    expect(xml).toContain("<title>Fantasy</title>");
    expect(xml).toContain('<content type="text">1 book</content>');
    expect(xml).not.toContain("<title>Horror</title>");
  });
});

describe("newBooksFeed (KOReader sync catalog)", () => {
  const rows = [
    row({ id: "aaaaaaaa-0000-0000-0000-000000000001", title: "Old", file_uploaded_at: "2026-01-01T00:00:00Z" }),
    row({ id: "aaaaaaaa-0000-0000-0000-000000000002", title: "Done", status: "done", file_uploaded_at: "2026-05-01T00:00:00Z" }),
    row({ id: "aaaaaaaa-0000-0000-0000-000000000003", title: "Tie low", file_uploaded_at: "2026-03-01T00:00:00Z" }),
    row({ id: "aaaaaaaa-0000-0000-0000-000000000004", title: "Tie high", file_uploaded_at: "2026-03-01T00:00:00Z" }),
  ];

  it("lists every book by upload time, newest first, then by id", () => {
    expect(selectNewBooks(rows).map((r) => r.title)).toEqual(["Done", "Tie high", "Tie low", "Old"]);
  });

  it("gives each entry the acquisition link first and no navigation link", () => {
    const xml = newBooksFeed(
      [row({ image_url: "https://images.example.com/c.jpg", mood_keys: ["cozy"] })],
      ORIGIN,
      NOW,
    );
    const entry = xml.slice(xml.indexOf("<entry>"), xml.indexOf("</entry>"));
    const links = entry.match(/<link [^>]*\/>/g) ?? [];

    expect(xml).toContain('<link rel="self" href="https://theque.app/opds/new"');
    expect(links[0]).toBe(
      '<link rel="http://opds-spec.org/acquisition" href="https://theque.app/opds/file/11111111-1111-1111-1111-111111111111" type="application/epub+zip"/>',
    );
    expect(links.filter((link) => link.includes("acquisition"))).toHaveLength(1);
    expect(entry).not.toContain("opds-catalog");
    expect(entry).not.toContain('rel="subsection"');
  });
});

describe("download helpers", () => {
  it("encodes the file name for Content-Disposition", () => {
    expect(contentDisposition("Author - Title (Series 01).epub")).toBe(
      `attachment; filename="Author - Title (Series 01).epub"; filename*=UTF-8''Author%20-%20Title%20%28Series%2001%29.epub`,
    );
    expect(contentDisposition('Brontë "Jane".epub')).toBe(
      `attachment; filename="Bront_ _Jane_.epub"; filename*=UTF-8''Bront%C3%AB%20%22Jane%22.epub`,
    );
    expect(contentDisposition(null)).toContain('filename="book.epub"');
  });

  it("knows a KEPUB name", () => {
    expect(isKepubFileName("A - B.kepub.epub")).toBe(true);
    expect(isKepubFileName("A - B.epub")).toBe(false);
    expect(isKepubFileName(null)).toBe(false);
  });

  it("streams the bytes in chunks", async () => {
    const bytes = new Uint8Array(10).map((_, index) => index);
    const reader = byteStream(bytes, 4).getReader();
    const chunks: number[][] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push([...value]);
    }
    expect(chunks).toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8, 9]]);
  });
});

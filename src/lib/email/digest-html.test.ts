import { describe, expect, it } from "vitest";

import { digestSubject, escapeHtml, renderDigestHtml } from "./digest-html";
import type { DigestLetter } from "./digest-letter";

const APP_URL = "https://theque.app";

function makeLetter(overrides: Partial<DigestLetter> = {}): DigestLetter {
  return {
    forgotten: [],
    ratingPrompts: [],
    recommendation: null,
    appUrl: APP_URL,
    unsubscribeUrl: `${APP_URL}/unsubscribe/token-1`,
    ...overrides,
  };
}

const FORGOTTEN = {
  id: "item-1",
  title: "The Dispossessed",
  domain: "goodreads.com",
  category: "books" as const,
  created_at: "2026-01-02T00:00:00.000Z",
};

const PROMPT = {
  id: "item-2",
  title: "Chungking Express",
  domain: "imdb.com",
  category: "movies_and_tv" as const,
  done_at: "2026-07-20T00:00:00.000Z",
  starLinks: [1, 2, 3, 4, 5].map((stars) => ({
    stars,
    url: `${APP_URL}/rate/token-${stars}`,
  })),
};

describe("escapeHtml", () => {
  it("neutralizes markup in scraped titles", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">&')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;",
    );
  });
});

describe("renderDigestHtml", () => {
  it("renders the forgotten section with a link per item", () => {
    const html = renderDigestHtml(makeLetter({ forgotten: [FORGOTTEN] }));

    expect(html).toContain("Still on your shelves");
    expect(html).toContain("The Dispossessed");
    expect(html).toContain(`${APP_URL}/item/item-1`);
  });

  it("omits sections that have nothing in them", () => {
    const html = renderDigestHtml(makeLetter({ ratingPrompts: [PROMPT] }));

    expect(html).not.toContain("Still on your shelves");
    expect(html).not.toContain("One pick for you");
    expect(html).toContain("How was it?");
  });

  it("renders five one-tap star links per unrated item", () => {
    const html = renderDigestHtml(makeLetter({ ratingPrompts: [PROMPT] }));

    for (const stars of [1, 2, 3, 4, 5]) {
      expect(html).toContain(`${APP_URL}/rate/token-${stars}`);
    }
    expect(html).toContain("no sign-in needed");
  });

  it("escapes attacker-influenced titles and LLM copy", () => {
    const html = renderDigestHtml(
      makeLetter({
        forgotten: [{ ...FORGOTTEN, title: '<script>alert("x")</script>' }],
        recommendation: {
          shelf_id: "books",
          title: "<b>Solaris</b>",
          subtitle: "Stanisław Lem",
          description: "",
          reason: 'because "you" liked <i>this</i>',
          canonical_url: "https://openlibrary.org/works/OL1W",
          cover_url: null,
        },
      }),
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Solaris</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;i&gt;this&lt;/i&gt;");
  });

  it("always carries a visible unsubscribe link", () => {
    const html = renderDigestHtml(makeLetter({ forgotten: [FORGOTTEN] }));

    expect(html).toContain(`${APP_URL}/unsubscribe/token-1`);
    expect(html).toContain("Unsubscribe");
  });

  it("uses a table layout with inline styles only", () => {
    const html = renderDigestHtml(makeLetter({ forgotten: [FORGOTTEN] }));

    expect(html).toContain("<table");
    expect(html).not.toContain("<style");
    expect(html).not.toContain("<script");
  });
});

describe("digestSubject", () => {
  it("leads with the rating ask when there is one", () => {
    expect(
      digestSubject(makeLetter({ forgotten: [FORGOTTEN], ratingPrompts: [PROMPT] })),
    ).toBe("How was Chungking Express?");
  });

  it("falls back to the shelf nudge", () => {
    expect(digestSubject(makeLetter({ forgotten: [FORGOTTEN] }))).toBe(
      "Still on your shelves: The Dispossessed",
    );
    expect(
      digestSubject(makeLetter({ forgotten: [FORGOTTEN, { ...FORGOTTEN, id: "item-9" }] })),
    ).toBe("2 things still on your shelves");
  });

  it("falls back to the recommendation, then to a plain subject", () => {
    expect(
      digestSubject(
        makeLetter({
          recommendation: {
            shelf_id: "watch",
            title: "Stalker",
            subtitle: "",
            description: "",
            reason: "",
            canonical_url: "https://www.themoviedb.org/movie/1",
            cover_url: null,
          },
        }),
      ),
    ).toBe("One pick for you: Stalker");
    expect(digestSubject(makeLetter())).toBe("Your thèque");
  });

  it("falls back to the domain when an item has no title", () => {
    expect(digestSubject(makeLetter({ forgotten: [{ ...FORGOTTEN, title: null }] }))).toBe(
      "Still on your shelves: goodreads.com",
    );
  });
});

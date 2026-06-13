// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { collectPageSnapshot } from "./page-snapshot";

describe("collectPageSnapshot", () => {
  it("collects title, meta tags, JSON-LD, and main-content text", () => {
    document.head.innerHTML = `
      <link rel="canonical" href="https://www.imdb.com/title/tt0468569/">
      <meta property="og:title" content="The Dark Knight (2008)">
      <meta name="twitter:card" content="summary_large_image">
      <meta charset="utf-8">
      <script type="application/ld+json">{"@type":"Movie","name":"The Dark Knight"}</script>
    `;
    document.title = "The Dark Knight (2008) - IMDb";
    document.body.innerHTML = `
      <nav>Menu Home About</nav>
      <main><p>When the menace known as the Joker wreaks havoc on Gotham City.</p></main>
    `;

    const snap = collectPageSnapshot();

    expect(snap.page_title).toBe("The Dark Knight (2008) - IMDb");
    expect(snap.canonical_url).toBe("https://www.imdb.com/title/tt0468569/");
    expect(snap.meta).toContainEqual({
      attr: "property",
      key: "og:title",
      content: "The Dark Knight (2008)",
    });
    expect(snap.meta).toContainEqual({
      attr: "name",
      key: "twitter:card",
      content: "summary_large_image",
    });
    expect(snap.json_ld).toEqual(['{"@type":"Movie","name":"The Dark Knight"}']);
    expect(snap.text).toContain("Joker");
    expect(snap.text).not.toContain("Menu Home About");
    expect(snap.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("falls back to body text when no main/article exists and caps length", () => {
    document.head.innerHTML = "";
    document.body.innerHTML = `<div>${"word ".repeat(5000)}</div>`;

    const snap = collectPageSnapshot();

    expect(snap.text).toBeDefined();
    expect((snap.text ?? "").length).toBeLessThanOrEqual(8192);
  });
});

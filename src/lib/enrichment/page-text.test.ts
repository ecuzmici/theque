import { describe, expect, it } from "vitest";

import { extractPageText } from "@/lib/enrichment/page-text";

describe("extractPageText", () => {
  it("prefers main content and strips nav/script/style noise", () => {
    const html = `<!DOCTYPE html><html><head>
      <style>.x { color: red; }</style>
      <script>var tracking = true;</script>
    </head><body>
      <nav>Home About Contact</nav>
      <main><h1>Slow-Cooked Ragu</h1><p>Ingredients: 500g beef, 2 onions, garlic.</p></main>
      <footer>Copyright 2026</footer>
    </body></html>`;

    const text = extractPageText(html);

    expect(text).toContain("Slow-Cooked Ragu");
    expect(text).toContain("500g beef");
    expect(text).not.toContain("Home About Contact");
    expect(text).not.toContain("Copyright 2026");
    expect(text).not.toContain("tracking");
  });

  it("falls back to body when no main/article exists", () => {
    const html = "<html><body><div><p>Just a plain page about a restaurant in Lisbon.</p></div></body></html>";
    expect(extractPageText(html)).toContain("restaurant in Lisbon");
  });

  it("caps output at 4000 characters", () => {
    const html = `<html><body><main>${"verylongword ".repeat(2000)}</main></body></html>`;
    expect(extractPageText(html)?.length).toBeLessThanOrEqual(4000);
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(extractPageText("")).toBeNull();
    expect(extractPageText("<html><body><main>   </main></body></html>")).toBeNull();
  });
});

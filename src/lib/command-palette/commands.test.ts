import { describe, expect, it } from "vitest";

import { filterCommands, looksLikeUrl } from "./commands";

describe("looksLikeUrl", () => {
  it("accepts http(s) URLs, trimming whitespace", () => {
    expect(looksLikeUrl("https://example.com")).toBe(true);
    expect(looksLikeUrl("  http://example.com/x  ")).toBe(true);
    expect(looksLikeUrl("HTTPS://EXAMPLE.COM")).toBe(true);
  });

  it("rejects non-URL text and bare domains", () => {
    expect(looksLikeUrl("books")).toBe(false);
    expect(looksLikeUrl("example.com")).toBe(false);
    expect(looksLikeUrl("ftp://example.com")).toBe(false);
    expect(looksLikeUrl("")).toBe(false);
  });
});

describe("filterCommands", () => {
  const commands = [
    { id: "all", label: "All", keywords: ["library", "everything"] },
    { id: "books", label: "Books", keywords: ["reading", "shelf"] },
    { id: "watch", label: "Watch", keywords: ["movies", "tv", "shelf"] },
    { id: "settings", label: "Settings", keywords: ["account"] },
  ];

  it("returns all commands for an empty or whitespace query", () => {
    expect(filterCommands(commands, "")).toHaveLength(4);
    expect(filterCommands(commands, "   ")).toHaveLength(4);
  });

  it("matches the label case-insensitively", () => {
    expect(filterCommands(commands, "BOO").map((c) => c.id)).toEqual(["books"]);
  });

  it("matches keywords", () => {
    expect(filterCommands(commands, "movies").map((c) => c.id)).toEqual([
      "watch",
    ]);
  });

  it("AND-matches every term across label and keywords", () => {
    expect(filterCommands(commands, "shelf tv").map((c) => c.id)).toEqual([
      "watch",
    ]);
    expect(filterCommands(commands, "shelf").map((c) => c.id)).toEqual([
      "books",
      "watch",
    ]);
  });

  it("returns nothing when a term matches no command", () => {
    expect(filterCommands(commands, "nonexistent")).toEqual([]);
  });
});

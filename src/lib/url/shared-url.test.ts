import { describe, expect, it } from "vitest";

import { extractSharedUrl } from "./shared-url";

describe("extractSharedUrl", () => {
  it("uses the url parameter first", () => {
    expect(extractSharedUrl({ url: "https://a.example/x", text: "https://b.example/y" })).toBe(
      "https://a.example/x",
    );
  });

  it("falls back to text when url is empty", () => {
    expect(extractSharedUrl({ url: "", text: "https://x.y/z" })).toBe("https://x.y/z");
  });

  it("finds a link inside text with other words", () => {
    expect(extractSharedUrl({ text: "Title https://x.y/z" })).toBe("https://x.y/z");
    expect(extractSharedUrl({ text: "Read this (https://x.y/z)." })).toBe("https://x.y/z");
  });

  it("checks the title last", () => {
    expect(extractSharedUrl({ text: "no link", title: "See https://t.example/a" })).toBe(
      "https://t.example/a",
    );
  });

  it("returns null when no value holds a link", () => {
    expect(extractSharedUrl({ url: "", text: "just words", title: null })).toBeNull();
    expect(extractSharedUrl({})).toBeNull();
  });
});

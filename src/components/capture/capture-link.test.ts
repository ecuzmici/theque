import { afterEach, describe, expect, it, vi } from "vitest";

import {
  linkFromClipboardText,
  linkHost,
  parseUrlLines,
  readClipboardLink,
  saveLink,
} from "./capture-link";

describe("linkFromClipboardText", () => {
  it("accepts one http(s) link with whitespace around it", () => {
    expect(linkFromClipboardText("  https://www.imdb.com/title/tt0111161/\n")).toBe(
      "https://www.imdb.com/title/tt0111161/",
    );
  });

  it("rejects text that is not only a link", () => {
    expect(linkFromClipboardText("read this https://example.com")).toBeNull();
    expect(linkFromClipboardText("example.com")).toBeNull();
    expect(linkFromClipboardText("ftp://example.com/file")).toBeNull();
    expect(linkFromClipboardText("")).toBeNull();
  });
});

describe("linkHost", () => {
  it("removes www from the host", () => {
    expect(linkHost("https://www.goodreads.com/book/show/1")).toBe("goodreads.com");
  });

  it("returns the input when it is not a URL", () => {
    expect(linkHost("not a url")).toBe("not a url");
  });
});

describe("parseUrlLines", () => {
  it("keeps unique http(s) links in order", () => {
    expect(parseUrlLines("https://a.com\nfoo https://b.com\nhttps://a.com")).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });
});

describe("readClipboardLink", () => {
  it("finds a link", async () => {
    const clipboard = { readText: vi.fn().mockResolvedValue("https://example.com/x") };
    await expect(readClipboardLink(clipboard)).resolves.toEqual({
      state: "found",
      url: "https://example.com/x",
    });
  });

  it("reports none when the clipboard holds no link", async () => {
    const clipboard = { readText: vi.fn().mockResolvedValue("hello") };
    await expect(readClipboardLink(clipboard)).resolves.toEqual({ state: "none" });
  });

  it("reports denied when the read fails or the API is missing", async () => {
    const clipboard = { readText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) };
    await expect(readClipboardLink(clipboard)).resolves.toEqual({ state: "denied" });
    await expect(readClipboardLink(undefined)).resolves.toEqual({ state: "denied" });
  });
});

describe("saveLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the capture API and returns the item id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ item: { id: "item-9" }, created: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveLink({ url: "https://example.com", note: "", source: "manual" }),
    ).resolves.toEqual({ ok: true, itemId: "item-9", created: true });

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/capture");
    expect(JSON.parse(init.body)).toEqual({ url: "https://example.com", source: "manual" });
  });

  it("returns the API error code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "invalid_url" }), { status: 400 })),
    );
    await expect(saveLink({ url: "x", source: "manual" })).resolves.toEqual({
      ok: false,
      error: "invalid_url",
    });
  });

  it("returns a network error when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(saveLink({ url: "https://example.com", source: "manual" })).resolves.toEqual({
      ok: false,
      error: "Network error.",
    });
  });
});

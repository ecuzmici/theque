import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveApp } from "@/lib/enrichment/resolvers/github";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("resolveApp", () => {
  it("ignores non-repo GitHub URLs and non-GitHub URLs", async () => {
    expect(await resolveApp({ canonicalUrl: "https://github.com/explore", title: null, structured: {} })).toBeNull();
    expect(await resolveApp({ canonicalUrl: "https://gitlab.com/a/b", title: null, structured: {} })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a repo to developer, description, language, owner avatar", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        description: "A fast bundler",
        language: "Rust",
        owner: { login: "vercel", avatar_url: "https://avatars.githubusercontent.com/u/1.png" },
      }),
    });

    const patch = await resolveApp({
      canonicalUrl: "https://github.com/vercel/turbo",
      title: null,
      structured: {},
    });

    expect(fetchMock.mock.calls[0][0].toString()).toBe("https://api.github.com/repos/vercel/turbo");
    expect(patch).toEqual({
      source: "github",
      description: "A fast bundler",
      image_url: "https://avatars.githubusercontent.com/u/1.png",
      structured: { developer: "vercel", category_tag: "Rust" },
    });
  });

  it("returns null on 403/429 rate limit or fetch error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    expect(await resolveApp({ canonicalUrl: "https://github.com/a/b", title: null, structured: {} })).toBeNull();
    fetchMock.mockRejectedValue(new Error("net"));
    expect(await resolveApp({ canonicalUrl: "https://github.com/a/b", title: null, structured: {} })).toBeNull();
  });
});

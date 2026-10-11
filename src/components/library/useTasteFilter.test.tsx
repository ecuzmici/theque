import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { libraryCacheKey, parseTasteSelection, useTasteFilter } from "./useTasteFilter";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/library",
}));

describe("parseTasteSelection", () => {
  it("reads a valid genre and mood", () => {
    const p = new URLSearchParams("genre=horror&mood=eerie");
    expect(parseTasteSelection(p, "watch")).toEqual({ genre: "horror", mood: "eerie" });
  });

  it("drops a genre that is not in the list of the shelf", () => {
    const p = new URLSearchParams("genre=documentary&mood=nope&x=1");
    expect(parseTasteSelection(p, "books")).toEqual({ genre: null, mood: null });
  });

  it("gives no filter on a shelf without chips", () => {
    const p = new URLSearchParams("genre=horror&mood=eerie");
    expect(parseTasteSelection(p, "all")).toEqual({ genre: null, mood: null });
    expect(parseTasteSelection(p, "read")).toEqual({ genre: null, mood: null });
  });
});

describe("libraryCacheKey", () => {
  it("uses the shelf id when no chip is active", () => {
    expect(libraryCacheKey("books")).toBe("books");
    expect(libraryCacheKey("books", { genre: null, mood: null })).toBe("books");
  });

  it("gives each shelf, genre and mood its own key", () => {
    const keys = new Set([
      libraryCacheKey("books"),
      libraryCacheKey("books", { genre: "horror", mood: null }),
      libraryCacheKey("books", { genre: null, mood: "eerie" }),
      libraryCacheKey("books", { genre: "horror", mood: "eerie" }),
      libraryCacheKey("watch", { genre: "horror", mood: null }),
    ]);
    expect(keys.size).toBe(5);
  });
});

const state = { latest: undefined as unknown as ReturnType<typeof useTasteFilter> };
function capture(value: ReturnType<typeof useTasteFilter>) {
  state.latest = value;
}
function Harness({ shelf }: { shelf: "books" | "watch" | "all" }) {
  capture(useTasteFilter(shelf));
  return null;
}

describe("useTasteFilter", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    nav.replace.mockReset();
    nav.params = new URLSearchParams("shelf=books&genre=fantasy");
    window.history.replaceState(null, "", "/library?shelf=books&genre=fantasy&q=dune");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          genres: [{ key: "fantasy", label: "Fantasy", count: 5 }],
          moods: [{ key: "epic", label: "Epic", count: 3 }],
        }),
        { status: 200 },
      ),
    );
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    vi.restoreAllMocks();
  });

  async function render(shelf: "books" | "watch" | "all") {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Harness shelf={shelf} />));
  }

  it("starts from the URL and loads the facets of the shelf", async () => {
    await render("books");
    expect(state.latest.genre).toBe("fantasy");
    expect(state.latest.mood).toBeNull();
    expect(state.latest.active).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/items/taste-facets?shelf=books");
    expect(state.latest.facets?.genres[0]?.key).toBe("fantasy");
  });

  it("writes the mood with router.replace, keeps other keys, and shows it at once", async () => {
    await render("books");
    await act(async () => state.latest.setMood("epic"));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    const [href, opts] = nav.replace.mock.calls[0] as [string, { scroll: boolean }];
    const params = new URL(href, "http://x").searchParams;
    expect(params.get("genre")).toBe("fantasy");
    expect(params.get("mood")).toBe("epic");
    expect(params.get("q")).toBe("dune");
    expect(opts).toEqual({ scroll: false });
    expect(state.latest.mood).toBe("epic");
  });

  it("clears both keys", async () => {
    await render("books");
    await act(async () => state.latest.clear());
    const [href] = nav.replace.mock.calls[0] as [string];
    const params = new URL(href, "http://x").searchParams;
    expect(params.has("genre")).toBe(false);
    expect(params.has("mood")).toBe(false);
    expect(state.latest.active).toBe(false);
  });

  it("gives no filter and no fetch on a shelf without chips", async () => {
    nav.params = new URLSearchParams("genre=horror");
    await render("all");
    expect(state.latest.enabled).toBe(false);
    expect(state.latest.genre).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await act(async () => state.latest.setGenre("horror"));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("ignores the URL filter while the shelf change is pending", async () => {
    // The screen shows Watch, but the URL still names Books.
    await render("watch");
    expect(state.latest.genre).toBeNull();
  });

  it("hides the chips when the facets request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
    await render("books");
    expect(state.latest.facets).toBeNull();
    expect(state.latest.facetsLoading).toBe(false);
  });
});

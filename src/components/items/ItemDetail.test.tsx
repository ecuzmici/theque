import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ItemDetail, type ItemDetailModel } from "./ItemDetail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/hooks/useItemStatusRealtime", () => ({
  useItemStatusRealtime: () => {},
}));

function makeItem(patch: Partial<ItemDetailModel> = {}): ItemDetailModel {
  return {
    id: "item-1",
    user_id: "user-1",
    url: "https://www.imdb.com/title/tt1375666/",
    canonical_url: "https://www.imdb.com/title/tt1375666/",
    url_fingerprint: "fp",
    domain: "www.imdb.com",
    title: "Inception",
    subtitle: "Christopher Nolan · 2010",
    description: null,
    image_url: null,
    image_storage_path: null,
    category: "movies_and_tv",
    category_confidence: 1,
    category_source: "domain",
    status: "want",
    source: "web",
    note: null,
    processing_status: "ready",
    enrichment_error: null,
    enrichment_attempts: 1,
    enriched_at: null,
    structured: { year: 2010, runtime_minutes: 148, directors: ["Christopher Nolan"] },
    raw_metadata: {},
    display: {},
    dominant_color: "#1c1917",
    dominant_hue: null,
    rating_personal: null,
    verdict: null,
    done_at: null,
    file_drive_id: null,
    file_name: null,
    file_bytes: null,
    file_sha256: null,
    file_uploaded_at: null,
    search_vector: null,
    created_at: "2026-05-17T12:00:00.000Z",
    updated_at: "2026-05-17T12:00:00.000Z",
    ...patch,
  } as ItemDetailModel;
}

describe("ItemDetail", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  const fetchMock = vi.fn();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
  });

  async function render(item: ItemDetailModel) {
    await act(async () => {
      root?.render(<ItemDetail initial={item} showBookFile={false} />);
    });
  }

  it("shows the year one time and does not repeat the director in Details", async () => {
    await render(makeItem());

    const text = document.body.textContent ?? "";
    expect(text.match(/2010/g)).toHaveLength(1);
    expect(text).toContain("Christopher Nolan · 2010 · 2 h 28 m");
    expect(text).not.toContain("Directors");
  });

  it("links a book saved from Open Library to a Goodreads search", async () => {
    await render(
      makeItem({
        url: "https://openlibrary.org/works/OL17823492W",
        domain: "openlibrary.org",
        title: "Children of Time",
        subtitle: null,
        category: "books",
        structured: { authors: ["Adrian Tchaikovsky"] },
      }),
    );

    const link = Array.from(document.querySelectorAll("a")).find(
      (a) => a.textContent === "Goodreads",
    );
    expect(link?.getAttribute("href")).toBe(
      "https://www.goodreads.com/search?q=Children%20of%20Time%20Adrian%20Tchaikovsky",
    );
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it("links the director in the byline to a search of the Watch shelf", async () => {
    await render(makeItem());

    const link = document.querySelector<HTMLAnchorElement>(
      'a[aria-label="Search your library for Christopher Nolan"]',
    );
    expect(link?.textContent).toBe("Christopher Nolan");
    expect(link?.getAttribute("href")).toBe("/library?shelf=watch&q=Christopher+Nolan");
  });

  it("does not show the Goodreads link for a movie", async () => {
    await render(makeItem());

    const texts = Array.from(document.querySelectorAll("a")).map((a) => a.textContent);
    expect(texts).not.toContain("Goodreads");
  });

  it("draws a typographic cover tinted with the dominant color when there is no image", async () => {
    await render(makeItem());

    const cover = document.querySelector<HTMLElement>('[data-testid="item-type-cover"]');
    expect(cover?.textContent).toContain("Inception");
    expect(cover?.style.backgroundColor).toBe("rgb(28, 25, 23)");
  });

  it("marks the item done through the item PATCH when a star is tapped", async () => {
    const doneItem = makeItem({
      status: "done",
      rating_personal: 4,
      done_at: "2026-10-01T12:00:00.000Z",
    });
    fetchMock.mockResolvedValue({ ok: true, json: async () => doneItem });
    await render(makeItem());
    expect(document.querySelector("textarea")).toBeNull();

    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[aria-label="4 stars"]')?.click();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "done", rating_personal: 4 }),
      }),
    );
    expect(document.body.textContent).toContain("You watched it");
    expect(document.querySelector("textarea")).not.toBeNull();
  });

  it("shows the saved rating and verdict of a done item for editing", async () => {
    await render(
      makeItem({
        status: "done",
        rating_personal: 5,
        verdict: "Still thinking about it",
        done_at: "2026-10-01T12:00:00.000Z",
      }),
    );

    expect(
      document.querySelector('button[aria-label="5 stars"]')?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(document.querySelector("textarea")?.value).toBe("Still thinking about it");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import SearchPage from "./page";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

describe("SearchPage", () => {
  afterEach(() => {
    redirect.mockReset();
  });

  it("redirects a query to the library search", async () => {
    await SearchPage({ searchParams: Promise.resolve({ q: " dune " }) });
    expect(redirect).toHaveBeenCalledWith("/library?q=dune");
  });

  it("redirects to the library when there is no query", async () => {
    await SearchPage({ searchParams: Promise.resolve({}) });
    expect(redirect).toHaveBeenCalledWith("/library");
  });

  it("uses the first value of a repeated q", async () => {
    await SearchPage({ searchParams: Promise.resolve({ q: ["a b", "c"] }) });
    expect(redirect).toHaveBeenCalledWith("/library?q=a+b");
  });
});

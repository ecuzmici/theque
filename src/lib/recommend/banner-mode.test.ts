import { describe, expect, it } from "vitest";

import { bannerModeForShelf } from "@/lib/recommend/banner-mode";

describe("bannerModeForShelf", () => {
  it("offers both categories (heuristic) on the all shelf", () => {
    expect(bannerModeForShelf("all")).toEqual({ kind: "auto" });
  });

  it("features Books on the books shelf", () => {
    expect(bannerModeForShelf("books")).toEqual({ kind: "featured", shelfId: "books" });
  });

  it("features Watch on the watch shelf", () => {
    expect(bannerModeForShelf("watch")).toEqual({ kind: "featured", shelfId: "watch" });
  });

  it.each(["read", "other", "inbox", "forgotten"] as const)(
    "disables the banner on the %s shelf",
    (shelf) => {
      expect(bannerModeForShelf(shelf)).toEqual({ kind: "disabled" });
    },
  );
});

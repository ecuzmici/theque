import { describe, expect, it } from "vitest";

import { buildAmbientTiles, type AmbientRow } from "./ambient-tiles";

function row(overrides: Partial<AmbientRow> & { id: string }): AmbientRow {
  return {
    title: null,
    image_url: null,
    image_storage_path: null,
    dominant_color: null,
    ...overrides,
  };
}

describe("buildAmbientTiles", () => {
  it("resolves a cover from a remote image_url", () => {
    const tiles = buildAmbientTiles([
      row({ id: "a", image_url: "https://img.example/cover.jpg", title: "Dune" }),
    ]);
    expect(tiles).toEqual([
      { id: "a", src: "https://img.example/cover.jpg", color: null, title: "Dune" },
    ]);
  });

  it("keeps color-only tiles (no cover) as tinted cells", () => {
    const tiles = buildAmbientTiles([row({ id: "a", dominant_color: "#3366aa" })]);
    expect(tiles).toEqual([{ id: "a", src: null, color: "#3366aa", title: null }]);
  });

  it("drops rows with neither a cover nor a color", () => {
    const tiles = buildAmbientTiles([
      row({ id: "blank" }),
      row({ id: "keep", dominant_color: "#abc" }),
      row({ id: "bad-url", image_url: "not-a-url" }),
    ]);
    expect(tiles.map((t) => t.id)).toEqual(["keep"]);
  });

  it("caps at max and preserves the incoming (hue) order", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ id: `i${i}`, dominant_color: `#0000${i}` }),
    );
    const tiles = buildAmbientTiles(rows, 3);
    expect(tiles.map((t) => t.id)).toEqual(["i0", "i1", "i2"]);
  });

  it("returns nothing for an empty library", () => {
    expect(buildAmbientTiles([])).toEqual([]);
  });
});

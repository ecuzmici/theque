import { describe, expect, it } from "vitest";

import {
  DEMO_ITEMS,
  DEMO_SHELF_IDS,
  demoItemMatchesShelf,
  demoItemsForShelf,
  hexToHue,
  sortDemoItemsByHue,
  type DemoItem,
} from "./demo-library";

describe("demoItemMatchesShelf", () => {
  it("puts everything on the All shelf", () => {
    expect(DEMO_ITEMS.every((i) => demoItemMatchesShelf(i, "all"))).toBe(true);
  });

  it("keeps finished items off the category backlogs and only on Done", () => {
    const dune = DEMO_ITEMS.find((i) => i.title === "Dune")!;
    expect(dune.status).toBe("done");
    expect(demoItemMatchesShelf(dune, "books")).toBe(false);
    expect(demoItemMatchesShelf(dune, "done")).toBe(true);
  });

  it("routes wanted books to Books and films to Watch", () => {
    const book: DemoItem = { ...DEMO_ITEMS[0], category: "books", status: "want" };
    const film: DemoItem = { ...DEMO_ITEMS[0], category: "movies_and_tv", status: "want" };
    expect(demoItemMatchesShelf(book, "books")).toBe(true);
    expect(demoItemMatchesShelf(book, "watch")).toBe(false);
    expect(demoItemMatchesShelf(film, "watch")).toBe(true);
  });

  it("groups the long-tail categories under Other", () => {
    for (const category of ["restaurants", "products", "travel", "recipes"] as const) {
      const item: DemoItem = { ...DEMO_ITEMS[0], category, status: "want" };
      expect(demoItemMatchesShelf(item, "other")).toBe(true);
      expect(demoItemMatchesShelf(item, "books")).toBe(false);
    }
  });

  it("has at least one item on every demo shelf (no empty tabs)", () => {
    for (const shelf of DEMO_SHELF_IDS) {
      expect(demoItemsForShelf(shelf).length).toBeGreaterThan(0);
    }
  });
});

describe("hexToHue", () => {
  it("maps primaries onto the color wheel", () => {
    expect(Math.round(hexToHue("#ff0000"))).toBe(0);
    expect(Math.round(hexToHue("#00ff00"))).toBe(120);
    expect(Math.round(hexToHue("#0000ff"))).toBe(240);
  });

  it("returns 0 for greys and unparseable input", () => {
    expect(hexToHue("#808080")).toBe(0);
    expect(hexToHue("not-a-color")).toBe(0);
  });

  it("tolerates a missing leading hash", () => {
    expect(Math.round(hexToHue("00ff00"))).toBe(120);
  });
});

describe("sortDemoItemsByHue", () => {
  it("orders items around the wheel and is stable for equal hues", () => {
    // red and both greys all resolve to hue 0, so they keep their input order;
    // green (120) and blue (240) follow around the wheel.
    const items: DemoItem[] = [
      { ...DEMO_ITEMS[0], id: "blue", dominantColor: "#0000ff" },
      { ...DEMO_ITEMS[0], id: "red", dominantColor: "#ff0000" },
      { ...DEMO_ITEMS[0], id: "grey-a", dominantColor: "#808080" },
      { ...DEMO_ITEMS[0], id: "grey-b", dominantColor: "#777777" },
      { ...DEMO_ITEMS[0], id: "green", dominantColor: "#00ff00" },
    ];
    expect(sortDemoItemsByHue(items).map((i) => i.id)).toEqual([
      "red",
      "grey-a",
      "grey-b",
      "green",
      "blue",
    ]);
  });

  it("does not mutate the input array", () => {
    const items = demoItemsForShelf("all");
    const snapshot = items.map((i) => i.id);
    sortDemoItemsByHue(items);
    expect(items.map((i) => i.id)).toEqual(snapshot);
  });
});

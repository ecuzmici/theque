import { describe, expect, it } from "vitest";

import {
  MOODS,
  type ColoredItem,
  type MoodId,
  bucketByMood,
  hexToHsl,
  moodForItem,
  normalizeHue,
} from "./moods";

function item(dominant_hue: number | null, dominant_color: string | null): ColoredItem {
  return { dominant_hue, dominant_color };
}

describe("normalizeHue", () => {
  it("wraps into [0, 360)", () => {
    expect(normalizeHue(0)).toBe(0);
    expect(normalizeHue(360)).toBe(0);
    expect(normalizeHue(370)).toBe(10);
    expect(normalizeHue(-10)).toBe(350);
  });

  it("rejects nullish / non-finite", () => {
    expect(normalizeHue(null)).toBeNull();
    expect(normalizeHue(undefined)).toBeNull();
    expect(normalizeHue(Number.NaN)).toBeNull();
    expect(normalizeHue(Infinity)).toBeNull();
  });
});

describe("hexToHsl", () => {
  it("parses 6- and 3-digit hex (with/without #)", () => {
    expect(hexToHsl("#ff0000")).toEqual({ h: 0, s: 1, l: 0.5 });
    expect(hexToHsl("00ff00")).toEqual({ h: 120, s: 1, l: 0.5 });
    expect(hexToHsl("#00f")).toEqual({ h: 240, s: 1, l: 0.5 });
  });

  it("reports zero saturation for greys", () => {
    const hsl = hexToHsl("#808080");
    expect(hsl?.s).toBe(0);
  });

  it("returns null for garbage", () => {
    expect(hexToHsl("nope")).toBeNull();
    expect(hexToHsl("#12")).toBeNull();
    expect(hexToHsl("")).toBeNull();
  });
});

describe("moodForItem — chromatic hue boundaries", () => {
  // Use a saturated mid-light colour so the neutral guard never fires; the hue
  // drives the bucket. (color is incidental here; hue wins.)
  const c = "#cc4422"; // saturated, mid lightness

  it.each<[number, MoodId]>([
    [0, "reds"],
    [14.9, "reds"],
    [345, "reds"],
    [359, "reds"],
    [15, "ambers"],
    [59.9, "ambers"],
    [60, "greens"],
    [159.9, "greens"],
    [160, "blues"],
    [249.9, "blues"],
    [250, "purples"],
    [344.9, "purples"],
  ])("hue %s → %s", (hue, expected) => {
    expect(moodForItem(item(hue, c))).toBe(expected);
  });

  it("wraps out-of-range hue before bucketing", () => {
    expect(moodForItem(item(360, c))).toBe("reds");
    expect(moodForItem(item(380, c))).toBe("ambers"); // 380 → 20
    expect(moodForItem(item(420, c))).toBe("greens"); // 420 → 60 (boundary)
  });
});

describe("moodForItem — neutrals & fallback", () => {
  it("classes low-saturation covers as neutral regardless of hue", () => {
    expect(moodForItem(item(200, "#808080"))).toBe("neutrals");
  });

  it("classes near-black and near-white covers as neutral", () => {
    expect(moodForItem(item(120, "#050505"))).toBe("neutrals");
    expect(moodForItem(item(30, "#fdfdfd"))).toBe("neutrals");
  });

  it("falls back to 'uncolored' when there is no hue and no colour", () => {
    expect(moodForItem(item(null, null))).toBe("uncolored");
  });

  it("derives a chromatic mood from the colour when hue is missing", () => {
    expect(moodForItem(item(null, "#1f6fd0"))).toBe("blues");
  });

  it("uses the stored hue even when a colour is present", () => {
    // hue says greens; colour is a saturated blue — stored hue wins.
    expect(moodForItem(item(100, "#1f6fd0"))).toBe("greens");
  });
});

describe("bucketByMood", () => {
  it("returns spectrum order, drops empty buckets, preserves input order", () => {
    const items = [
      item(240, "#1f6fd0"), // blues
      item(5, "#cc2222"), // reds
      item(241, "#1f70d1"), // blues (after the first blue)
      item(null, null), // uncolored
    ];
    const buckets = bucketByMood(items);
    expect(buckets.map((b) => b.mood.id)).toEqual(["reds", "blues", "uncolored"]);
    const blues = buckets.find((b) => b.mood.id === "blues")!;
    expect(blues.items).toEqual([items[0], items[2]]);
  });

  it("returns [] for no items", () => {
    expect(bucketByMood([])).toEqual([]);
  });

  it("every mood id is representable", () => {
    // Sanity: MOODS covers exactly the ids the bucketer can emit.
    expect(new Set(MOODS.map((m) => m.id)).size).toBe(MOODS.length);
  });
});

import { describe, expect, it } from "vitest";

import { HEADER_HEIGHT, NOTCH_DROP, notchGeometry } from "./notch-geometry";

describe("notchGeometry", () => {
  it("centers the tab and hangs it below the bar", () => {
    const geo = notchGeometry(390, 120);
    expect(geo.height).toBe(HEADER_HEIGHT + NOTCH_DROP);
    // The tab sides sit at 135 and 255 on a 390px header.
    expect(geo.stroke).toContain("L 135 ");
    expect(geo.stroke).toContain("L 255 ");
  });

  it("starts and ends the outline at the top edge, so it never draws the top", () => {
    const geo = notchGeometry(1440, 140);
    expect(geo.stroke.startsWith("M ")).toBe(true);
    expect(geo.stroke.split(" ").slice(1, 3)).toEqual(["642", "0"]);
    expect(geo.stroke.endsWith(" 0")).toBe(true);
  });

  it("joins the full-width bar and the tab in the fill", () => {
    const geo = notchGeometry(800, 100);
    expect(geo.fill.startsWith(`M 0 0 L 0 ${HEADER_HEIGHT} L 800 ${HEADER_HEIGHT} L 800 0 Z`)).toBe(true);
    expect(geo.fill).toContain(geo.stroke);
  });
});

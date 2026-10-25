import { describe, expect, it } from "vitest";

import { spineEdgeGradient } from "./spine-edge";

const colors = (n: number) => Array.from({ length: n }, (_, i) => `#${i.toString(16).padStart(6, "0")}`);

describe("spineEdgeGradient", () => {
  it("returns null below 8 colors, so the edge stays a keyline", () => {
    expect(spineEdgeGradient(colors(7), 390)).toBeNull();
  });

  it("returns null before the width is measured", () => {
    expect(spineEdgeGradient(colors(20), 0)).toBeNull();
  });

  it("draws one hard-stop spine per sampled color, about 4px wide", () => {
    const gradient = spineEdgeGradient(colors(20), 40)!;
    const stops = gradient.replace(/^linear-gradient\(to right, |\)$/g, "").split(", ");
    expect(stops).toHaveLength(10);
    expect(stops[0]).toBe("#000000 0.000% 10.000%");
    expect(stops[9]).toMatch(/ 100\.000%$/);
  });

  it("caps the spine count on a wide screen", () => {
    const gradient = spineEdgeGradient(colors(1000), 4000)!;
    expect(gradient.split("%,").length).toBeLessThanOrEqual(400);
  });
});

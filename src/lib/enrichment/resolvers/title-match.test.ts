import { describe, expect, it } from "vitest";

import { authorsOverlap, titleScore } from "./title-match";

describe("titleScore", () => {
  it("scores exact, partial, and unrelated titles", () => {
    expect(titleScore("Piranesi", "piranesi")).toBe(2);
    expect(titleScore("Piranesi: A Study Guide", "Piranesi")).toBe(1);
    expect(titleScore("Dune", "Piranesi")).toBe(0);
  });
});

describe("authorsOverlap", () => {
  it.each([
    [["Ursula K. Le Guin"], ["Ursula Le Guin"]],
    [["Liu Cixin"], ["Cixin Liu"]],
    [["Adrian Tchaikovsky"], ["Someone Else", "Adrian Tchaikovsky"]],
    [["José Saramago"], ["Jose Saramago"]],
  ])("matches %j and %j", (a, b) => {
    expect(authorsOverlap(a, b)).toBe(true);
  });

  it("does not match different people or empty lists", () => {
    expect(authorsOverlap(["William J. Collopy"], ["Susanna Clarke"])).toBe(false);
    expect(authorsOverlap([], ["Susanna Clarke"])).toBe(false);
    expect(authorsOverlap(["Susanna Clarke"], [])).toBe(false);
  });
});

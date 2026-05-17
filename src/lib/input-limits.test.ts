import { describe, expect, it } from "vitest";

import {
  hasMaxItems,
  hasMaxLength,
  MAX_NOTE_LENGTH,
  MAX_TAG_NAME_LENGTH,
  normalizeLimitedTagNames,
} from "./input-limits";

describe("input limits", () => {
  it("checks string length limits", () => {
    expect(hasMaxLength("x".repeat(MAX_NOTE_LENGTH), MAX_NOTE_LENGTH)).toBe(true);
    expect(hasMaxLength("x".repeat(MAX_NOTE_LENGTH + 1), MAX_NOTE_LENGTH)).toBe(false);
  });

  it("checks array count limits", () => {
    expect(hasMaxItems(["a", "b"], 2)).toBe(true);
    expect(hasMaxItems(["a", "b", "c"], 2)).toBe(false);
  });

  it("normalizes, deduplicates, and rejects overlong tag names", () => {
    expect(normalizeLimitedTagNames([" Design ", "design", "", "READ"])).toEqual(["design", "read"]);
    expect(normalizeLimitedTagNames(["x".repeat(MAX_TAG_NAME_LENGTH + 1)])).toBeNull();
  });
});

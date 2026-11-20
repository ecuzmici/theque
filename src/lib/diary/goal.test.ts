import { describe, expect, it } from "vitest";

import { parseReadingGoal, readingGoalFromMetadata } from "./goal";

describe("parseReadingGoal", () => {
  it("accepts a whole number of books from 1 to 500", () => {
    expect(parseReadingGoal("40")).toBe(40);
    expect(parseReadingGoal(" 12 ")).toBe(12);
    expect(parseReadingGoal(1)).toBe(1);
    expect(parseReadingGoal("500")).toBe(500);
  });

  it("rejects fractions, signs, words and out-of-range numbers", () => {
    for (const bad of ["", "0", "-3", "501", "12.5", "1e2", "40 books", "abc", null, undefined, 3.5, Number.NaN, {}]) {
      expect(parseReadingGoal(bad)).toBeNull();
    }
  });
});

describe("readingGoalFromMetadata", () => {
  it("reads a valid goal from the auth user metadata", () => {
    expect(readingGoalFromMetadata({ reading_goal: 24, name: "x" })).toBe(24);
  });

  it("ignores a missing or invalid goal", () => {
    expect(readingGoalFromMetadata(undefined)).toBeNull();
    expect(readingGoalFromMetadata({})).toBeNull();
    expect(readingGoalFromMetadata({ reading_goal: 0 })).toBeNull();
    expect(readingGoalFromMetadata({ reading_goal: "lots" })).toBeNull();
  });
});

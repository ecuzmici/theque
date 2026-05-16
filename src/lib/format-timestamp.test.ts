import { describe, expect, it } from "vitest";

import { formatDbTimestampUtc } from "./format-timestamp";

describe("formatDbTimestampUtc", () => {
  it("uses fixed locale and UTC for SSR/client parity", () => {
    expect(formatDbTimestampUtc("2026-05-15T19:52:05.000Z")).toBe(
      "15/05/2026, 19:52:05",
    );
  });

  it("returns the input when parsing fails", () => {
    expect(formatDbTimestampUtc("not-a-real-date")).toBe("not-a-real-date");
  });
});

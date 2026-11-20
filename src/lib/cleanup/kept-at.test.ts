import { describe, expect, it } from "vitest";

import { parseItemId, parseRestoredKeptAt } from "./kept-at";

const NOW = Date.parse("2026-11-20T12:00:00.000Z");

describe("parseItemId", () => {
  it("accepts a uuid and rejects other values", () => {
    expect(parseItemId("3f2b8c1e-9d4a-4f6b-8a2c-1e5d7f9b0c3a")).toBe("3f2b8c1e-9d4a-4f6b-8a2c-1e5d7f9b0c3a");
    expect(parseItemId("not-an-id")).toBeNull();
    expect(parseItemId(42)).toBeNull();
  });
});

describe("parseRestoredKeptAt", () => {
  it("accepts null, to restore an item that the user never kept", () => {
    expect(parseRestoredKeptAt(null, NOW)).toEqual({ ok: true, value: null });
  });

  it("accepts a past timestamp and returns it in ISO form", () => {
    expect(parseRestoredKeptAt("2026-01-02T03:04:05Z", NOW)).toEqual({
      ok: true,
      value: "2026-01-02T03:04:05.000Z",
    });
  });

  it("rejects a future timestamp, a bad string and other types", () => {
    expect(parseRestoredKeptAt("2027-01-01T00:00:00Z", NOW).ok).toBe(false);
    expect(parseRestoredKeptAt("yesterday", NOW).ok).toBe(false);
    expect(parseRestoredKeptAt(123, NOW).ok).toBe(false);
    expect(parseRestoredKeptAt(undefined, NOW).ok).toBe(false);
  });
});

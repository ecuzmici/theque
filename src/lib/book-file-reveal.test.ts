import { describe, expect, it } from "vitest";

import { isBookFileRevealed } from "./book-file-reveal";

const REVEAL_MS = Date.parse("2026-08-12T15:30:00Z");
const BEFORE = REVEAL_MS - 1;
const env = (extra: Record<string, string> = {}) => extra as NodeJS.ProcessEnv;

describe("isBookFileRevealed", () => {
  it("hides the field before the reveal instant", () => {
    expect(isBookFileRevealed("her@example.com", BEFORE, env())).toBe(false);
  });

  it("shows the field at the reveal instant", () => {
    expect(isBookFileRevealed("her@example.com", REVEAL_MS, env())).toBe(true);
  });

  it("keeps 17:30 Warsaw summer time as 15:30 UTC", () => {
    expect(new Date(REVEAL_MS).toLocaleString("en-GB", { timeZone: "Europe/Warsaw" })).toBe(
      "12/08/2026, 17:30:00",
    );
  });

  it("shows the field early to the listed emails, and ignores case and spaces", () => {
    const withList = env({ BOOK_FILE_REVEAL_EMAILS: "owner@example.com, second@example.com" });
    expect(isBookFileRevealed(" Owner@Example.com ", BEFORE, withList)).toBe(true);
    expect(isBookFileRevealed("second@example.com", BEFORE, withList)).toBe(true);
    expect(isBookFileRevealed("her@example.com", BEFORE, withList)).toBe(false);
  });

  it("hides the field from a viewer without an email", () => {
    expect(isBookFileRevealed(null, BEFORE, env())).toBe(false);
  });

  it("reveals the field for everybody when BOOK_FILE_REVEAL_AT is now", () => {
    expect(isBookFileRevealed("her@example.com", BEFORE, env({ BOOK_FILE_REVEAL_AT: "now" }))).toBe(
      true,
    );
  });

  it("accepts a custom instant", () => {
    const custom = env({ BOOK_FILE_REVEAL_AT: "2026-09-01T00:00:00Z" });
    expect(isBookFileRevealed("her@example.com", REVEAL_MS, custom)).toBe(false);
    expect(isBookFileRevealed("her@example.com", Date.parse("2026-09-01T00:00:00Z"), custom)).toBe(
      true,
    );
  });

  it("falls back to an open gate when the instant does not parse", () => {
    expect(isBookFileRevealed("her@example.com", BEFORE, env({ BOOK_FILE_REVEAL_AT: "soon" }))).toBe(
      true,
    );
  });
});

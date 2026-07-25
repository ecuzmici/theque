import { describe, expect, it } from "vitest";

import { MAX_NOTE_LENGTH, MAX_TITLE_LENGTH } from "@/lib/input-limits";
import {
  classifyUrl,
  cleanValue,
  htmlToPlainText,
  parseBookmarkTimestamp,
  splitLabels,
  stripBom,
  toIsoDate,
  truncateNote,
  truncateTitle,
  unixTimestampToIso,
  unwrapExcelEscape,
} from "@/lib/import/value";

describe("stripBom", () => {
  it("removes a leading UTF-8 BOM only", () => {
    expect(stripBom("\uFEFFBook Id")).toBe("Book Id");
    expect(stripBom("Book Id")).toBe("Book Id");
    expect(stripBom("Book\uFEFFId")).toBe("Book\uFEFFId");
  });
});

describe("unwrapExcelEscape", () => {
  it('peels off Goodreads-style ="0123456789" escaping', () => {
    // Goodreads wraps ISBNs so Excel keeps the leading zero instead of
    // rendering 9.78038E+12.
    expect(unwrapExcelEscape('="9780375826689"')).toBe("9780375826689");
    expect(unwrapExcelEscape('="0123456789"')).toBe("0123456789");
    expect(unwrapExcelEscape('=""')).toBe("");
    expect(unwrapExcelEscape("plain")).toBe("plain");
    expect(unwrapExcelEscape('"quoted"')).toBe('"quoted"');
  });

  it("is applied by cleanValue", () => {
    expect(cleanValue('  ="0044" ')).toBe("0044");
    expect(cleanValue('=""')).toBeNull();
  });
});

describe("parseBookmarkTimestamp", () => {
  it("reads ADD_DATE as Unix seconds", () => {
    expect(parseBookmarkTimestamp("1600000000")).toEqual({
      kind: "ok",
      iso: "2020-09-13T12:26:40.000Z",
    });
    expect(unixTimestampToIso("1600000000")).toBe("2020-09-13T12:26:40.000Z");
  });

  it("accepts millisecond values from third-party tooling", () => {
    expect(unixTimestampToIso("1600000000000")).toBe("2020-09-13T12:26:40.000Z");
  });

  it("rejects Chrome's 1601-epoch microseconds instead of inventing a date", () => {
    // Users hand over Chrome's internal `Bookmarks` JSON by mistake; its
    // date_added is microseconds since 1601, ~1.3e16.
    const parsed = parseBookmarkTimestamp("13244025600000000");
    expect(parsed.kind).toBe("out_of_range");
    expect(unixTimestampToIso("13244025600000000")).toBeNull();
  });

  it("reports absent and junk values as none", () => {
    expect(parseBookmarkTimestamp(null)).toEqual({ kind: "none" });
    expect(parseBookmarkTimestamp("")).toEqual({ kind: "none" });
    expect(parseBookmarkTimestamp("0")).toEqual({ kind: "none" });
    expect(parseBookmarkTimestamp("nope")).toEqual({ kind: "none" });
  });
});

describe("toIsoDate", () => {
  it("reads slash dates as UTC, not in the server's local zone", () => {
    // Goodreads and StoryGraph write YYYY/MM/DD; a file round-tripped through
    // Excel writes M/D/YYYY. `new Date(...)` would parse both locally, so the
    // same export would import different done_at values per deployment.
    expect(toIsoDate("2023/07/14")).toBe("2023-07-14T00:00:00.000Z");
    expect(toIsoDate("8/10/2023")).toBe("2023-08-10T00:00:00.000Z");
    // 13 cannot be a month, so this one has to be D/M/YYYY.
    expect(toIsoDate("13/8/2023")).toBe("2023-08-13T00:00:00.000Z");
  });

  it("still handles ISO dates, Unix seconds and junk", () => {
    expect(toIsoDate("2023-04-01")).toBe("2023-04-01T00:00:00.000Z");
    expect(toIsoDate("1600000000")).toBe("2020-09-13T12:26:40.000Z");
    expect(toIsoDate("2024/01/01-2024/01/07")).toBeNull();
    expect(toIsoDate("")).toBeNull();
  });
});

describe("htmlToPlainText", () => {
  it("flattens an exported review into text", () => {
    // Goodreads' My Review and Letterboxd's Review are stored as HTML.
    expect(htmlToPlainText("<p>Loved it, eventually.</p><br/>Slow start.")).toBe(
      "Loved it, eventually.\nSlow start.",
    );
    expect(htmlToPlainText("A &quot;great&quot; time &amp; a half")).toBe(
      'A "great" time & a half',
    );
    // `&amp;` decodes last, so an escaped entity does not become a tag.
    expect(htmlToPlainText("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
    expect(htmlToPlainText("<i>plain</i>")).toBe("plain");
    expect(htmlToPlainText(null)).toBeNull();
    expect(htmlToPlainText("<p></p>")).toBeNull();
  });
});

describe("truncateNote", () => {
  it("caps a verdict at MAX_NOTE_LENGTH", () => {
    const note = truncateNote("x".repeat(MAX_NOTE_LENGTH + 500));
    expect(note).not.toBeNull();
    expect(note!.length).toBe(MAX_NOTE_LENGTH);
    expect(note!.endsWith("…")).toBe(true);
  });

  it("leaves a short note untouched", () => {
    expect(truncateNote("  loved it  ")).toBe("loved it");
    expect(truncateNote("")).toBeNull();
  });
});

describe("truncateTitle", () => {
  it("caps a title at MAX_TITLE_LENGTH and collapses whitespace", () => {
    const title = truncateTitle("y".repeat(MAX_TITLE_LENGTH + 10));
    expect(title!.length).toBe(MAX_TITLE_LENGTH);
    expect(truncateTitle("  A\n  spaced   title ")).toBe("A spaced title");
  });
});

describe("splitLabels", () => {
  it("splits, trims and dedupes case-insensitively", () => {
    expect(splitLabels("tech, ai ,Tech")).toEqual(["tech", "ai"]);
    expect(splitLabels("a|b", "|")).toEqual(["a", "b"]);
    expect(splitLabels("")).toEqual([]);
    expect(splitLabels(null)).toEqual([]);
  });
});

describe("classifyUrl", () => {
  it("accepts http(s) and rejects everything else with a distinct reason", () => {
    expect(classifyUrl("https://example.com/a")).toBe("ok");
    expect(classifyUrl("http://example.com/a")).toBe("ok");
    expect(classifyUrl("javascript:void(0)")).toBe("unsupported_scheme");
    expect(classifyUrl("data:text/html,hi")).toBe("unsupported_scheme");
    expect(classifyUrl("chrome://bookmarks/")).toBe("unsupported_scheme");
    expect(classifyUrl("file:///Users/x/notes.txt")).toBe("unsupported_scheme");
    expect(classifyUrl("place:folder=1")).toBe("unsupported_scheme");
    expect(classifyUrl("not a url")).toBe("invalid");
  });
});

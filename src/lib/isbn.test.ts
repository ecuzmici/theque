import { describe, expect, it } from "vitest";

import { firstValidIsbn, isEnglishGroupIsbn, normalizeIsbn } from "./isbn";

describe("normalizeIsbn", () => {
  it.each([
    ["978-0-375-82669-6", "9780375826696"],
    ["9781635575637", "9781635575637"],
    ["163557563X", "163557563X"],
    ["0-8044-2957-x", "080442957X"],
    [" 0316462845 ", "0316462845"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeIsbn(input)).toBe(expected);
  });

  it.each([
    ["9781635575638"], // wrong check digit
    ["1635575631"], // wrong check digit
    ["0062383077"], // stored in a real library row, wrong check digit
    ["1234567890123"], // no 978/979 prefix
    ["n/a"],
    [""],
    [null],
    [undefined],
    [{}],
  ])("rejects %s", (input) => {
    expect(normalizeIsbn(input)).toBeNull();
  });
});

describe("firstValidIsbn", () => {
  it("skips empty and invalid values", () => {
    expect(firstValidIsbn([null, "", "9781635575638", "1635575648"])).toBe("1635575648");
    expect(firstValidIsbn([null, undefined])).toBeNull();
  });
});

describe("isEnglishGroupIsbn", () => {
  it.each([["9781635575637"], ["9780316462846"], ["9798217374274"], ["163557563X"], ["0316462845"]])(
    "accepts %s",
    (isbn) => expect(isEnglishGroupIsbn(isbn)).toBe(true),
  );
  it.each([["9786069674482"], ["9788834730317"], ["9783453269118"], ["9781635575638"], [null]])(
    "rejects %s",
    (isbn) => expect(isEnglishGroupIsbn(isbn)).toBe(false),
  );
});

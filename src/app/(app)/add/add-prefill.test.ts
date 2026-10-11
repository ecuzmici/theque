import { describe, expect, it } from "vitest";

import { addPrefill } from "./add-prefill";

describe("addPrefill", () => {
  it("uses the url param and keeps the title as the note", () => {
    expect(addPrefill({ url: "https://example.com/a", title: "A great read" })).toEqual({
      url: "https://example.com/a",
      note: "A great read",
      source: "mobile_share_extension",
    });
  });

  it("finds the link inside the text param", () => {
    expect(addPrefill({ url: "", text: "Look at this https://example.com/b" })).toMatchObject({
      url: "https://example.com/b",
      source: "mobile_share_extension",
    });
  });

  it("drops a title that only repeats the link", () => {
    expect(addPrefill({ title: "https://example.com/c" })).toEqual({
      url: "https://example.com/c",
      note: "",
      source: "mobile_share_extension",
    });
  });

  it("gives a manual capture with no link when the query is empty", () => {
    expect(addPrefill({})).toEqual({ url: null, note: "", source: "manual" });
  });
});

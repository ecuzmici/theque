import { describe, expect, it } from "vitest";

import { bookUploadPath, isOwnBookUploadPath } from "./book-upload-staging";

const UPLOAD_ID = "0b6f7a52-3c1d-4e8f-9a2b-5c6d7e8f9a0b";

describe("isOwnBookUploadPath", () => {
  it("accepts a path that bookUploadPath made for the same user and item", () => {
    expect(isOwnBookUploadPath(bookUploadPath("user-1", "item-1", UPLOAD_ID), "user-1", "item-1")).toBe(true);
  });

  it("rejects the path of another user", () => {
    expect(isOwnBookUploadPath(bookUploadPath("user-2", "item-1", UPLOAD_ID), "user-1", "item-1")).toBe(false);
  });

  it("rejects the path of another item", () => {
    expect(isOwnBookUploadPath(bookUploadPath("user-1", "item-2", UPLOAD_ID), "user-1", "item-1")).toBe(false);
  });

  it("rejects a path that climbs out of the folder", () => {
    expect(isOwnBookUploadPath(`user-1/item-1/../../user-2/item-9/${UPLOAD_ID}.epub`, "user-1", "item-1")).toBe(false);
  });

  it("rejects a value that is not a string", () => {
    expect(isOwnBookUploadPath(42, "user-1", "item-1")).toBe(false);
  });
});

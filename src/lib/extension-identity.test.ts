import { describe, expect, it } from "vitest";

import { CHROME_EXTENSION_ID, isAllowedExtensionId } from "./extension-identity";

const OTHER_ID = "abcdefghijklmnopabcdefghijklmnop";

describe("isAllowedExtensionId", () => {
  it("accepts the published extension id", () => {
    expect(isAllowedExtensionId(CHROME_EXTENSION_ID, "production")).toBe(true);
  });

  it("refuses any other id in production", () => {
    expect(isAllowedExtensionId(OTHER_ID, "production")).toBe(false);
    expect(isAllowedExtensionId("", "production")).toBe(false);
  });

  it("accepts an unpacked build id in development only", () => {
    expect(isAllowedExtensionId(OTHER_ID, "development")).toBe(true);
    expect(isAllowedExtensionId("not-an-extension-id", "development")).toBe(false);
  });
});

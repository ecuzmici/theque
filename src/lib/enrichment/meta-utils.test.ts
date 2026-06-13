import { describe, expect, it } from "vitest";

import { isJunkDescription } from "@/lib/enrichment/meta-utils";

describe("isJunkDescription", () => {
  it("treats empty/short descriptions as junk", () => {
    expect(isJunkDescription(null)).toBe(true);
    expect(isJunkDescription("")).toBe(true);
    expect(isJunkDescription("Too short.")).toBe(true);
  });

  it("treats error and bot-wall text as junk", () => {
    expect(isJunkDescription("Access Denied - you do not have permission to view this page.")).toBe(true);
    expect(isJunkDescription("Please enable JavaScript and complete the captcha to continue to site.")).toBe(true);
    expect(isJunkDescription("404 Not Found: the page you requested does not exist on the server.")).toBe(true);
  });

  it("accepts a real description", () => {
    expect(
      isJunkDescription("Batman raises the stakes in his war on crime with the help of Lt. Jim Gordon."),
    ).toBe(false);
  });
});

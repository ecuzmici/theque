import { describe, expect, it } from "vitest";

import { isErrorPageTitle, isJunkDescription } from "@/lib/enrichment/meta-utils";

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

describe("isErrorPageTitle", () => {
  it("flags bot-wall / interstitial titles", () => {
    expect(isErrorPageTitle("Just a moment...")).toBe(true);
    expect(isErrorPageTitle("Attention Required! | Cloudflare")).toBe(true);
    expect(isErrorPageTitle("Verifying you are human")).toBe(true);
    expect(isErrorPageTitle("Checking your browser before accessing")).toBe(true);
    expect(isErrorPageTitle("404 Not Found")).toBe(true);
  });

  it("accepts a real title", () => {
    expect(isErrorPageTitle("The Abyss")).toBe(false);
    expect(isErrorPageTitle(null)).toBe(false);
  });
});

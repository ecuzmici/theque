import { describe, expect, it } from "vitest";

import {
  authReasonMessage,
  getAuthErrorMessage,
  isValidOtpToken,
  normalizeOtpToken,
  sanitizeRedirectPath,
} from "./login-utils";

describe("login utils", () => {
  it("accepts 8 digit OTP tokens", () => {
    expect(normalizeOtpToken("1234 5678")).toBe("12345678");
    expect(isValidOtpToken("12345678")).toBe(true);
  });

  it("rejects OTP tokens shorter than Supabase's minimum", () => {
    expect(isValidOtpToken("12345")).toBe(false);
  });

  it("provides a fallback auth error message", () => {
    expect(getAuthErrorMessage({ message: "" }, "That code did not work. Try again or request a new code.")).toBe(
      "That code did not work. Try again or request a new code.",
    );
  });

  it("keeps redirect paths local", () => {
    expect(sanitizeRedirectPath("/library")).toBe("/library");
    expect(sanitizeRedirectPath("//evil.example")).toBe("/library");
    expect(sanitizeRedirectPath("/\\evil.example")).toBe("/library");
  });

  it.each([
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "library",
    "",
  ])("sends %j to the library", (value) => {
    expect(sanitizeRedirectPath(value)).toBe("/library");
  });

  it("decodes nothing: a percent-encoded tab stays a literal path", () => {
    expect(sanitizeRedirectPath("/%09/evil.com")).toBe("/%09/evil.com");
  });

  it("keeps a local path with a query and a hash", () => {
    expect(sanitizeRedirectPath("/library?shelf=books")).toBe("/library?shelf=books");
    expect(sanitizeRedirectPath("/item/abc#x")).toBe("/item/abc#x");
  });

  it("maps a known auth reason to fixed text", () => {
    expect(authReasonMessage("access_denied")).toMatch(/cancelled/);
    expect(authReasonMessage(null)).toBeNull();
  });

  it("never shows an unknown auth reason", () => {
    expect(authReasonMessage("Call 555")).toBe("Something went wrong during sign-in.");
  });
});

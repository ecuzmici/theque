import { describe, expect, it } from "vitest";

import { getAuthErrorMessage, isValidOtpToken, normalizeOtpToken, sanitizeRedirectPath } from "./login-utils";

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
});

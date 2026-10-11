import { describe, expect, it } from "vitest";

import { canUseBookFile } from "./book-file-access";

const OWNER = "6ff65b3e-9e28-40fe-9819-624168713cc8";

describe("canUseBookFile", () => {
  it("allows the default ids when the variable is unset", () => {
    expect(canUseBookFile(OWNER, {})).toBe(true);
    expect(canUseBookFile("8ae33297-7924-4e00-b7c6-94fab97e1323", {})).toBe(true);
  });

  it("refuses any other user", () => {
    expect(canUseBookFile("11111111-1111-1111-1111-111111111111", {})).toBe(false);
  });

  it("refuses a missing user", () => {
    expect(canUseBookFile(null, {})).toBe(false);
    expect(canUseBookFile("", {})).toBe(false);
  });

  it("uses the variable instead of the default when it is set", () => {
    const env = { BOOK_FILE_USER_IDS: " user-a , USER-B " };
    expect(canUseBookFile("user-a", env)).toBe(true);
    expect(canUseBookFile("user-b", env)).toBe(true);
    expect(canUseBookFile(OWNER, env)).toBe(false);
  });

  it("falls back to the default when the variable is empty", () => {
    expect(canUseBookFile(OWNER, { BOOK_FILE_USER_IDS: " , " })).toBe(true);
  });
});

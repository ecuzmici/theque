import { afterEach, describe, expect, it } from "vitest";

import { aiDailyLimitForUser } from "@/lib/ai/limits";

const TRUSTED = "b141fa72-3b97-473e-827f-7b249317fccb";
const STRANGER = "00000000-0000-0000-0000-000000000000";

afterEach(() => {
  delete process.env.AI_LIMIT_ELEVATED_USER_IDS;
  delete process.env.AI_LIMIT_ELEVATED_PER_DAY;
});

describe("aiDailyLimitForUser", () => {
  it("returns the base limit when no users are elevated", () => {
    expect(aiDailyLimitForUser(TRUSTED, 20)).toBe(20);
  });

  it("raises the cap for an elevated user", () => {
    process.env.AI_LIMIT_ELEVATED_USER_IDS = TRUSTED;
    process.env.AI_LIMIT_ELEVATED_PER_DAY = "200";
    expect(aiDailyLimitForUser(TRUSTED, 20)).toBe(200);
  });

  it("leaves every other user on the base limit", () => {
    process.env.AI_LIMIT_ELEVATED_USER_IDS = TRUSTED;
    process.env.AI_LIMIT_ELEVATED_PER_DAY = "200";
    expect(aiDailyLimitForUser(STRANGER, 20)).toBe(20);
  });

  it("parses a comma-separated list with stray whitespace", () => {
    process.env.AI_LIMIT_ELEVATED_USER_IDS = ` ${STRANGER} , ${TRUSTED} `;
    process.env.AI_LIMIT_ELEVATED_PER_DAY = "200";
    expect(aiDailyLimitForUser(TRUSTED, 20)).toBe(200);
    expect(aiDailyLimitForUser(STRANGER, 20)).toBe(200);
  });

  it("never lowers a limit when the elevated cap is smaller than the base", () => {
    process.env.AI_LIMIT_ELEVATED_USER_IDS = TRUSTED;
    process.env.AI_LIMIT_ELEVATED_PER_DAY = "5";
    expect(aiDailyLimitForUser(TRUSTED, 20)).toBe(20);
  });

  it("keeps the base limit when the elevated cap is unset or unparseable", () => {
    process.env.AI_LIMIT_ELEVATED_USER_IDS = TRUSTED;
    expect(aiDailyLimitForUser(TRUSTED, 20)).toBe(20);
    process.env.AI_LIMIT_ELEVATED_PER_DAY = "unlimited";
    expect(aiDailyLimitForUser(TRUSTED, 20)).toBe(20);
  });

  it("ignores an empty id list rather than elevating everyone", () => {
    process.env.AI_LIMIT_ELEVATED_USER_IDS = " , ";
    process.env.AI_LIMIT_ELEVATED_PER_DAY = "200";
    expect(aiDailyLimitForUser("", 20)).toBe(20);
    expect(aiDailyLimitForUser(STRANGER, 20)).toBe(20);
  });
});

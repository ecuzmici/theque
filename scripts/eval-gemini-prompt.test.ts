import { describe, expect, it } from "vitest";

import { evalConfig } from "./eval-gemini-prompt";

describe("evalConfig", () => {
  it("allows slower V2 prompts enough time to complete", () => {
    expect(evalConfig.timeoutMs).toBe(30_000);
  });
});

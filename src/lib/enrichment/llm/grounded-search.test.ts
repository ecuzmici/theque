import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
}));

vi.mock("server-only", () => ({}));

import { groundedLookup } from "@/lib/enrichment/llm/grounded-search";

describe("groundedLookup", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
  });
  afterEach(() => vi.unstubAllEnvs());

  const input = { finalUrl: "https://maps.google.com/place/Selva", title: "Selva" };

  it("skips when GEMINI_API_KEY is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await groundedLookup(input)).toBeNull();
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it("calls the SDK with the googleSearch tool and returns grounded text", async () => {
    generateContentMock.mockResolvedValue({
      text: "Selva is a tasting-menu restaurant in Lisbon, Portugal serving modern Portuguese cuisine.",
    });

    const text = await groundedLookup(input);

    expect(text).toContain("Lisbon");
    const callArg = generateContentMock.mock.calls[0][0];
    expect(callArg.config.tools).toEqual([{ googleSearch: {} }]);
    expect(callArg.config.responseJsonSchema).toBeUndefined();
    expect(callArg.contents).toContain("https://maps.google.com/place/Selva");
  });

  it("returns null on empty text or SDK error", async () => {
    generateContentMock.mockResolvedValue({ text: "   " });
    expect(await groundedLookup(input)).toBeNull();
    generateContentMock.mockRejectedValue(new Error("boom"));
    expect(await groundedLookup(input)).toBeNull();
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

import { generateJsonWithFallback } from "@/lib/ai/gateway";
import { isGatewayConfigured, parseModelList } from "@/lib/ai/gateway-config";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isGatewayConfigured", () => {
  it("is true with AI_GATEWAY_API_KEY", () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    delete process.env.VERCEL_OIDC_TOKEN;
    expect(isGatewayConfigured()).toBe(true);
    delete process.env.AI_GATEWAY_API_KEY;
  });

  it("is true with VERCEL_OIDC_TOKEN (Vercel deploys)", () => {
    delete process.env.AI_GATEWAY_API_KEY;
    process.env.VERCEL_OIDC_TOKEN = "oidc";
    expect(isGatewayConfigured()).toBe(true);
    delete process.env.VERCEL_OIDC_TOKEN;
  });

  it("is false with neither", () => {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    expect(isGatewayConfigured()).toBe(false);
  });
});

describe("parseModelList", () => {
  it("splits and trims a comma-separated env value", () => {
    expect(parseModelList(" a/b , c/d ", ["x"])).toEqual(["a/b", "c/d"]);
  });

  it("falls back when unset or empty", () => {
    expect(parseModelList(undefined, ["x", "y"])).toEqual(["x", "y"]);
    expect(parseModelList("  ", ["x"])).toEqual(["x"]);
  });
});

describe("generateJsonWithFallback", () => {
  it("parses JSON from the first successful model", async () => {
    mockGenerateText.mockResolvedValue({ text: '{"ok":true}' });
    const result = await generateJsonWithFallback<{ ok: boolean }>({
      models: ["openai/gpt-5-mini", "google/gemini-2.5-flash"],
      prompt: "p",
      label: "test",
    });
    expect(result.data.ok).toBe(true);
    expect(result.model).toBe("openai/gpt-5-mini");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("falls back to the next model when the first throws", async () => {
    mockGenerateText
      .mockRejectedValueOnce(new Error("503 overloaded"))
      .mockResolvedValueOnce({ text: '{"ok":1}' });
    const result = await generateJsonWithFallback({
      models: ["openai/gpt-5-mini", "google/gemini-2.5-flash"],
      prompt: "p",
      label: "test",
    });
    expect(result.model).toBe("google/gemini-2.5-flash");
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("falls back when a model returns unparseable text", async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: "not json at all" })
      .mockResolvedValueOnce({ text: '{"ok":1}' });
    const result = await generateJsonWithFallback({
      models: ["a/b", "c/d"],
      prompt: "p",
      label: "test",
    });
    expect(result.model).toBe("c/d");
  });

  it("strips a ```json code fence", async () => {
    mockGenerateText.mockResolvedValue({ text: '```json\n{"ok":true}\n```' });
    const result = await generateJsonWithFallback<{ ok: boolean }>({
      models: ["a/b"],
      prompt: "p",
      label: "test",
    });
    expect(result.data.ok).toBe(true);
  });

  it("throws when every model fails", async () => {
    mockGenerateText.mockRejectedValue(new Error("down"));
    await expect(
      generateJsonWithFallback({ models: ["a/b", "c/d"], prompt: "p", label: "test" }),
    ).rejects.toThrow();
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("throws when no models are configured", async () => {
    await expect(
      generateJsonWithFallback({ models: [], prompt: "p", label: "test" }),
    ).rejects.toThrow("no_models_configured");
  });
});

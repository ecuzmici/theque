import "server-only";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_TIMEOUT_MS = 15000;

export type GroundedLookupInput = {
  finalUrl: string;
  title: string | null;
};

function buildGroundedPrompt(input: GroundedLookupInput): string {
  return [
    "Identify the specific item at this URL using Google Search.",
    "Report its name, type/category, and any of: location/address, cuisine, brand, author/creator, year, publisher.",
    "Only state facts you find via search. If you cannot identify it, say so plainly.",
    "Keep it under 120 words.",
    "",
    `URL: ${input.finalUrl}`,
    `Known title (may be weak/missing): ${input.title ?? "(none)"}`,
  ].join("\n");
}

/**
 * Step 1 of the grounded two-step: a Google-Search-grounded free-text answer.
 * Grounding and strict JSON schema cannot combine, so this returns prose that
 * a second schema-enforced call structures. Fails open (null).
 */
export async function groundedLookup(input: GroundedLookupInput): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const timeoutEnv = Number.parseInt(process.env.GROUNDING_TIMEOUT_MS ?? "", 10);
  const timeoutMs = Number.isFinite(timeoutEnv) && timeoutEnv > 0 ? timeoutEnv : DEFAULT_TIMEOUT_MS;
  const model = process.env.GROUNDING_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: buildGroundedPrompt(input),
      config: {
        abortSignal: controller.signal,
        temperature: 0.1,
        tools: [{ googleSearch: {} }],
      },
    });
    const text = typeof response.text === "string" ? response.text.trim() : "";
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

import { FIELD_SOURCE_VALUES, type FieldSource } from "@/lib/enrichment/llm/category-schemas";

/**
 * Cleans a model payload before validation.
 *
 * Some gateway models fill every schema property, even when they have no
 * evidence. They send "" for unknown strings and 0 for unknown numbers (for
 * example average_rating: 0). Gemini omitted those fields, so the validators
 * and the merge expect a missing key, not a placeholder.
 *
 * Rules:
 * - Remove "", null, [] and {} values from the top level and from `structured`.
 * - Remove numeric 0 values from `structured`. No structured field uses 0 as
 *   a real value.
 * - Replace an unknown `field_sources` value with "model_knowledge". This is
 *   the most cautious label, so the merge still blocks volatile facts.
 */
export function normalizeLlmPayload(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (isEmpty(value)) continue;
    if (key === "structured" && isRecord(value)) {
      const structured = normalizeStructured(value);
      if (Object.keys(structured).length > 0) result.structured = structured;
      continue;
    }
    if (key === "field_sources" && isRecord(value)) {
      const fieldSources = normalizeFieldSources(value);
      if (Object.keys(fieldSources).length > 0) result.field_sources = fieldSources;
      continue;
    }
    result[key] = value;
  }
  return result;
}

const validFieldSources = new Set<string>(FIELD_SOURCE_VALUES);

function normalizeStructured(structured: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(structured)) {
    if (isEmpty(value) || value === 0) continue;
    result[key] = value;
  }
  return result;
}

function normalizeFieldSources(fieldSources: Record<string, unknown>): Record<string, FieldSource> {
  const result: Record<string, FieldSource> = {};
  for (const [key, value] of Object.entries(fieldSources)) {
    if (isEmpty(value)) continue;
    result[key] =
      typeof value === "string" && validFieldSources.has(value)
        ? (value as FieldSource)
        : "model_knowledge";
  }
  return result;
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

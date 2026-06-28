import type { ItemCategory, Json } from "@/lib/database.types";

export const EXTENSION_CATEGORY_HINTS = [
  "books",
  "movies_and_tv",
  "restaurants",
  "products",
  "travel",
  "articles",
  "recipes",
] as const satisfies readonly ItemCategory[];

export type ExtensionCategoryHint = (typeof EXTENSION_CATEGORY_HINTS)[number];

const EXTENSION_CATEGORY_HINT_SET = new Set<ExtensionCategoryHint>(EXTENSION_CATEGORY_HINTS);

export type CaptureCategoryHintParseResult = ExtensionCategoryHint | null | "invalid";

export function parseCaptureCategoryHint(value: unknown): CaptureCategoryHintParseResult {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  return EXTENSION_CATEGORY_HINT_SET.has(value as ExtensionCategoryHint)
    ? (value as ExtensionCategoryHint)
    : "invalid";
}

export function captureCategoryHintFromStructured(structured: Json): ExtensionCategoryHint | null {
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) return null;
  const value = structured.capture_category_hint;
  const parsed = parseCaptureCategoryHint(value);
  return parsed === "invalid" ? null : parsed;
}

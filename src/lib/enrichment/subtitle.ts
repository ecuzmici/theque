import type { ItemCategory } from "@/lib/database.types";

/**
 * The card byline built from structured fields: "Director · Year" for
 * movies and TV, "Author · Year" for books. Null for other categories.
 */
export function buildSubtitle(
  category: ItemCategory | null,
  structured: Record<string, unknown>,
): string | null {
  switch (category) {
    case "movies_and_tv": {
      const directors = structured.directors as string[] | undefined;
      const year = structured.year as number | undefined;
      const d = directors?.[0];
      if (d && year !== undefined) return `${d} · ${year}`;
      if (d) return d;
      if (year !== undefined) return String(year);
      return null;
    }
    case "books": {
      const authors = structured.authors as string[] | undefined;
      const py = structured.published_year as number | undefined;
      const a = authors?.[0];
      if (a && py !== undefined) return `${a} · ${py}`;
      if (a) return a;
      if (py !== undefined) return String(py);
      return null;
    }
    default:
      return null;
  }
}

/**
 * Pick the stored subtitle. Movies, TV and books use the structured byline,
 * so the format stays the same on every card. A page or LLM subtitle is used
 * only when the structured fields give none.
 */
export function chooseSubtitle(
  category: ItemCategory | null,
  structured: Record<string, unknown>,
  extracted: string | null,
): string | null {
  const built = buildSubtitle(category, structured);
  if (category === "movies_and_tv" || category === "books") return built ?? extracted;
  return extracted ?? built;
}

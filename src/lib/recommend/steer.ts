import type { ItemCategory } from "@/lib/database.types";
import { genreLabel, moodLabel } from "@/lib/taste/taste-lists";

/** Longest steer text, in characters (ADR 0020, decision 10). */
export const STEER_MAX_LENGTH = 80;

/**
 * Cleans the steer text from a request or a text field.
 * Removes control characters and double quotes, joins whitespace runs, and
 * cuts the text to STEER_MAX_LENGTH. Returns "" when the input is not a string.
 */
export function sanitizeSteer(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return (
    raw
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .replace(/["“”]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, STEER_MAX_LENGTH)
      .trim()
  );
}

/**
 * Builds the steer text from the active library chips.
 * A mood gives its lowercase label ("eerie"). A genre gives its label
 * ("Horror"). Both give "eerie Horror". A key that the lists do not hold is ignored.
 */
export function steerFromChips({
  category,
  genre,
  mood,
}: {
  category: ItemCategory | null | undefined;
  genre?: string | null;
  mood?: string | null;
}): string {
  const moodText = mood ? moodLabel(mood)?.toLowerCase() : null;
  const genreText = genre ? genreLabel(category, genre) : null;
  return sanitizeSteer([moodText, genreText].filter(Boolean).join(" "));
}

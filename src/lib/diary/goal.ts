/**
 * The yearly reading goal. It is in the auth user metadata as
 * `reading_goal` (a whole number of books), so it needs no table.
 */

export const READING_GOAL_KEY = "reading_goal";
export const READING_GOAL_MIN = 1;
export const READING_GOAL_MAX = 500;

/** A whole number of books from 1 to 500, or null. Accepts a form string or a number. */
export function parseReadingGoal(value: unknown): number | null {
  let goal: number;
  if (typeof value === "number") goal = value;
  else if (typeof value === "string" && /^\s*\d+\s*$/.test(value)) goal = Number(value.trim());
  else return null;
  if (!Number.isInteger(goal) || goal < READING_GOAL_MIN || goal > READING_GOAL_MAX) return null;
  return goal;
}

/** The goal in the auth user metadata, or null when there is no valid goal. */
export function readingGoalFromMetadata(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  return parseReadingGoal((metadata as Record<string, unknown>)[READING_GOAL_KEY]);
}

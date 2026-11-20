import { FORGOTTEN_AFTER_DAYS, isForgotten } from "@/lib/shelves";

/** The "Saved more than" choices. The first one is the Forgotten shelf age. */
export const AGE_CHOICES = [
  { days: FORGOTTEN_AFTER_DAYS, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 730, label: "2 years" },
] as const;

/** The fields of an item that the pass reads and changes. */
export type PassItem = {
  id: string;
  status: string;
  created_at: string;
  kept_at: string | null;
};

export type PassChoice = "keep" | "let_go";

/** One decision, with the item fields from before it, so an undo can restore them. */
export type PassDecision = {
  id: string;
  choice: PassChoice;
  before: { status: string; kept_at: string | null };
};

/** The items of one spring-cleaning pass and the decisions in order. */
export type PassState<T extends PassItem> = {
  items: T[];
  history: PassDecision[];
};

export function createPass<T extends PassItem>(items: T[]): PassState<T> {
  return { items, history: [] };
}

/** The age of an item starts at its save, or again at its last keep. */
function ageStart(item: PassItem): number {
  const created = Date.parse(item.created_at);
  const kept = item.kept_at ? Date.parse(item.kept_at) : Number.NEGATIVE_INFINITY;
  return Math.max(created, kept);
}

/** The items still to decide for an age choice: forgotten items, oldest first. */
export function passQueue<T extends PassItem>(state: PassState<T>, days: number, now: number): T[] {
  return state.items
    .filter((item) => isForgotten(item, days, now))
    .sort((a, b) => ageStart(a) - ageStart(b) || a.id.localeCompare(b.id));
}

/**
 * Records a decision. "Keep" sets `kept_at` to `at`, so the item is not
 * forgotten any more. "Let go" sets the status to `dismissed`.
 */
export function decide<T extends PassItem>(
  state: PassState<T>,
  id: string,
  choice: PassChoice,
  at: string,
): PassState<T> {
  const target = state.items.find((item) => item.id === id);
  if (!target) return state;
  const change = choice === "keep" ? { kept_at: at } : { status: "dismissed" };
  return {
    items: state.items.map((item) => (item.id === id ? { ...item, ...change } : item)),
    history: [...state.history, { id, choice, before: { status: target.status, kept_at: target.kept_at } }],
  };
}

/** Removes the decision on `id` and puts the item fields back. */
export function revertDecision<T extends PassItem>(state: PassState<T>, id: string): PassState<T> {
  const index = state.history.findLastIndex((d) => d.id === id);
  if (index < 0) return state;
  const { before } = state.history[index]!;
  return {
    items: state.items.map((item) => (item.id === id ? { ...item, ...before } : item)),
    history: state.history.filter((_, i) => i !== index),
  };
}

/** Undoes the last decision. `undone` tells the caller which write to reverse. */
export function undoLast<T extends PassItem>(
  state: PassState<T>,
): { state: PassState<T>; undone: PassDecision | null } {
  const undone = state.history.at(-1) ?? null;
  if (!undone) return { state, undone: null };
  return { state: revertDecision(state, undone.id), undone };
}

/** How long ago the user saved an item, in plain words: "7 months ago". */
export function savedAgo(createdAt: string, now: number): string {
  const days = Math.max(0, Math.round((now - Date.parse(createdAt)) / 86_400_000));
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (days < 45) return plural(days, "day");
  if (days < 700) return plural(Math.round(days / 30.44), "month");
  return plural(Math.round(days / 365.25), "year");
}

/** The count of each decision that stands. */
export function passSummary(state: PassState<PassItem>): { kept: number; letGo: number } {
  const kept = state.history.filter((d) => d.choice === "keep").length;
  return { kept, letGo: state.history.length - kept };
}

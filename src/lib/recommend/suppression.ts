/**
 * Suppression predicate for recommendation outcomes (ADR 0016).
 *
 * Shared by the API route and the yield eval so both apply the *same* rule —
 * the eval's "rounds-until-starvation" number is only trustworthy if it models
 * production suppression exactly.
 *
 * - `dismissed` / `saved`: a real signal (a no, or effectively owned) — suppress
 *   permanently.
 * - `shown`: shown-but-ignored is not rejection — suppress only inside the
 *   RECOMMEND_SHOWN_COOLDOWN_DAYS window, then let the title cycle back.
 */
import type { OutcomeRow } from "@/lib/recommend/taste-profile";

export function isSuppressedOutcome(row: OutcomeRow, cutoffMs: number): boolean {
  if (row.outcome === "dismissed" || row.outcome === "saved") return true;
  if (row.outcome === "shown") {
    return new Date(row.shown_at).getTime() > cutoffMs;
  }
  return false;
}

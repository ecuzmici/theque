/**
 * Per-user AI ceilings for trusted accounts.
 *
 * Elevation raises a daily cap; it never removes one. An account with no
 * ceiling can burn the Gemini key without bound if a client loops or a session
 * is stolen, so every user keeps a backstop.
 *
 * Pure env helpers, no "server-only" — mirrors ./gateway-config so
 * client-imported config modules can consume these safely.
 */

/** Comma-separated auth user ids that get AI_LIMIT_ELEVATED_PER_DAY. */
function elevatedUserIds(): Set<string> {
  return new Set(
    (process.env.AI_LIMIT_ELEVATED_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function elevatedPerDay(): number {
  const parsed = Number.parseInt(process.env.AI_LIMIT_ELEVATED_PER_DAY ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * The daily AI request cap for `userId`, given the cap everyone else gets.
 * Returns `baseLimit` unless the user is elevated and the elevated cap is
 * genuinely higher — elevation must never quietly tighten a limit.
 */
export function aiDailyLimitForUser(userId: string, baseLimit: number): number {
  if (!elevatedUserIds().has(userId)) return baseLimit;
  return Math.max(baseLimit, elevatedPerDay());
}

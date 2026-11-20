const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Allowed clock difference between the browser and the server. */
const CLOCK_SKEW_MS = 60_000;

/** Returns the item id when it is a uuid, else null. */
export function parseItemId(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

/**
 * Checks the `kept_at` value that an undo puts back. The value is null (never
 * kept) or a timestamp that is not in the future.
 */
export function parseRestoredKeptAt(
  value: unknown,
  now: number = Date.now(),
): { ok: true; value: string | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time > now + CLOCK_SKEW_MS) return { ok: false };
  return { ok: true, value: new Date(time).toISOString() };
}

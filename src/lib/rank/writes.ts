import type { RankWrite } from "./session";

/** A respace writes one key per item in a rating block. The body is JSON, so a long list is fine. */
export const MAX_WRITES = 2000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads untrusted input into writes. Returns null when any part is wrong. */
export function parseRankWrites(input: unknown): RankWrite[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_WRITES) return null;
  const seen = new Set<string>();
  const writes: RankWrite[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") return null;
    const { id, rankOrder } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !UUID.test(id) || seen.has(id)) return null;
    if (rankOrder !== null && (typeof rankOrder !== "number" || !Number.isFinite(rankOrder))) return null;
    seen.add(id);
    writes.push({ id, rankOrder });
  }
  return writes;
}

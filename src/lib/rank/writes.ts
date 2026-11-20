import type { ItemCategory } from "@/lib/database.types";

import { isValidKey } from "./rank-key";
import type { RankWrite } from "./session";
import { RANK_CATEGORIES } from "./top-ten";

/** A respace writes one key per item in a rating block. */
export const MAX_WRITES = 500;

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

export type RankTargetRow = {
  id: string;
  status: string;
  category: ItemCategory | null;
  rating_personal: number | null;
};

/**
 * Checks the writes against the user's rows (read through RLS). Each id must
 * be a visible row. A key must be a finished book or film, and the key must
 * be in the band of the current rating. A null key is always allowed.
 */
export function checkAgainstItems(writes: RankWrite[], rows: RankTargetRow[]): boolean {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return writes.every(({ id, rankOrder }) => {
    const row = byId.get(id);
    if (!row) return false;
    if (rankOrder === null) return true;
    return (
      row.status === "done" &&
      (RANK_CATEGORIES as readonly string[]).includes(row.category ?? "") &&
      row.rating_personal !== null &&
      isValidKey(row.rating_personal, rankOrder)
    );
  });
}

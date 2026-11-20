import "server-only";

import type { CleanupItem } from "@/components/cleanup/SpringCleaning";
import { loadLibrarySnapshot } from "@/lib/library-snapshot/load";
import { isForgotten } from "@/lib/shelves";

/**
 * Loads the forgotten items of the signed-in user for a spring-cleaning pass.
 * The shared loader reads through the session client (RLS) and decrypts the
 * items (ADR 0013). Only the fields that the card shows go to the client.
 * `now` is the moment of the load, so the server and the client use one cutoff.
 */
export async function loadCleanupPass(): Promise<{ items: CleanupItem[]; now: number }> {
  const snapshot = await loadLibrarySnapshot("/cleanup");
  const now = Date.now();
  const items = snapshot
    .map((item) => ({
      id: item.id,
      status: item.status,
      created_at: item.createdAt,
      kept_at: item.keptAt,
      title: item.title,
      byline: item.authors[0] ?? item.directors[0] ?? item.subtitle ?? null,
      year: item.year,
      category: item.category,
      color: item.color,
      cover: item.cover,
    }))
    .filter((item) => isForgotten(item, undefined, now));
  return { items, now };
}

import "server-only";

/**
 * Self-service account deletion, extracted as an injectable orchestration
 * seam (ADR 0013, decision B) so ordering and failure behavior are
 * unit-testable without a live Supabase project. The route handler
 * (`src/app/api/account/delete/route.ts`) resolves the session/confirm and
 * hands off the already-verified `userId` here — this module never resolves
 * identity itself.
 */

const BUCKET = "item-images";
const PAGE_SIZE = 100;

/** A single storage listing entry. A `null` id marks a pseudo-folder (Supabase Storage convention). */
export type StorageEntry = {
  name: string;
  id: string | null;
};

export type StorageBucketClient = {
  list(
    path: string,
    options: { limit: number; offset: number },
  ): Promise<{ data: StorageEntry[] | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
};

export type StorageClient = {
  from(bucket: string): StorageBucketClient;
};

export type AdminAuthClient = {
  deleteUser(userId: string): Promise<{ data: unknown; error: { message: string } | null }>;
};

export type DeleteAccountDeps = {
  storage: StorageClient;
  adminAuth: AdminAuthClient;
};

export type DeleteAccountResult = {
  /** Whether the account row itself (auth.users, and everything cascading from it) was deleted. */
  ok: boolean;
  /** Count of cover-image objects left behind after a partial storage purge failure. Never paths/ids. */
  orphanedFileCount: number;
};

/**
 * Purges every object under `item-images/<userId>/` (recursing into the
 * per-item pseudo-folders the cache writes into, see
 * `src/lib/enrichment/image-cache.ts`), then permanently deletes the auth
 * user — whose FK cascades erase every other row the account owns.
 *
 * Order matters: storage purge always runs strictly before `deleteUser`, so a
 * retryable purge still has a resolvable user id. If a batch fails to remove,
 * purging stops for that account (no infinite retry against a stuck object)
 * and the leftover objects are reported as a *count* — `deleteUser` still
 * runs regardless, since the rows referencing those files are gone either
 * way. Only counts are ever logged, never paths or ids.
 */
export async function deleteAccount(
  userId: string,
  { storage, adminAuth }: DeleteAccountDeps,
): Promise<DeleteAccountResult> {
  const orphanedFileCount = await purgeUserImages(storage, userId);

  const { error } = await adminAuth.deleteUser(userId);
  if (error) {
    console.error("[account/delete] deleteUser failed");
    return { ok: false, orphanedFileCount };
  }

  return { ok: true, orphanedFileCount };
}

async function purgeUserImages(storage: StorageClient, userId: string): Promise<number> {
  const bucket = storage.from(BUCKET);
  let orphanedFileCount = 0;

  async function purgePath(path: string): Promise<void> {
    for (;;) {
      const { data, error: listError } = await bucket.list(path, {
        limit: PAGE_SIZE,
        offset: 0,
      });

      if (listError) {
        console.error("[account/delete] storage list failed");
        return;
      }
      if (!data || data.length === 0) {
        return;
      }

      const files = data.filter((entry) => entry.id !== null);
      const folders = data.filter((entry) => entry.id === null);

      if (files.length > 0) {
        const { error: removeError } = await bucket.remove(
          files.map((entry) => `${path}${entry.name}`),
        );
        if (removeError) {
          orphanedFileCount += files.length;
          console.error("[account/delete] storage remove failed, count:", files.length);
          // Stop purging this account — retrying the same stuck batch forever
          // would never converge, and the row-level data is gone regardless.
          return;
        }
      }

      for (const folder of folders) {
        await purgePath(`${path}${folder.name}/`);
      }

      // A page shorter than the limit means this path is drained; a full
      // page means more objects may remain, so list again (removed entries
      // free up the same offset-0 window for the next batch).
      if (data.length < PAGE_SIZE) {
        return;
      }
    }
  }

  await purgePath(`${userId}/`);
  return orphanedFileCount;
}

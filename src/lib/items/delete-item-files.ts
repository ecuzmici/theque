import "server-only";

import type { StorageClient } from "@/lib/account/delete-account";

const BUCKET = "item-images";

export type DeleteItemFilesDeps = {
  /** Admin storage client. The `item-images` bucket has no user policies. */
  storage: StorageClient;
  /** Omit when Drive is not configured. A missing Drive file counts as success. */
  deleteDriveFile?: (driveId: string) => Promise<void>;
};

export type DeleteItemFilesResult = {
  coverObjectsRemoved: number;
  failures: number;
};

/**
 * Removes the files of an item that the row delete cannot cascade: the cached
 * cover objects under `item-images/<userId>/<itemId>/` and the book file in
 * Google Drive (and so on the Kobo device).
 *
 * Call it after the row delete succeeds. No row points at these files after
 * the delete, so nobody can remove them later. The function fails open: it
 * never throws, and it logs counts only, never paths or ids.
 */
export async function deleteItemFiles(
  item: { userId: string; itemId: string; driveId: string | null },
  deps: DeleteItemFilesDeps,
): Promise<DeleteItemFilesResult> {
  let coverObjectsRemoved = 0;
  let failures = 0;

  try {
    const prefix = `${item.userId}/${item.itemId}/`;
    const bucket = deps.storage.from(BUCKET);
    const { data, error } = await bucket.list(prefix, { limit: 100, offset: 0 });
    if (error) throw new Error("list_failed");
    const paths = (data ?? []).filter((entry) => entry.id !== null).map((e) => `${prefix}${e.name}`);
    if (paths.length > 0) {
      const { error: removeError } = await bucket.remove(paths);
      if (removeError) throw new Error("remove_failed");
      coverObjectsRemoved = paths.length;
    }
  } catch {
    failures += 1;
  }

  if (item.driveId && deps.deleteDriveFile) {
    try {
      await deps.deleteDriveFile(item.driveId);
    } catch {
      failures += 1;
    }
  }

  if (failures > 0) console.error("[items/delete] file cleanup failed, count:", failures);
  return { coverObjectsRemoved, failures };
}

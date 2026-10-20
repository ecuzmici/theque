/**
 * Allow-list for the book file field (the "Kobo file" block on item detail)
 * and for the book file route.
 *
 * Uploads go to Google Drive folders that sync to e-readers (see
 * `bookFileTarget` below), so only the accounts on this list can upload or
 * remove a book file. The check runs on the server only.
 *
 * `BOOK_FILE_USER_IDS` lists the allowed user ids. Use a comma to separate
 * two or more ids. When the variable is unset or empty, the code default
 * applies, so a missing variable cannot lock out the device owner.
 */
const DEFAULT_BOOK_FILE_USER_IDS = [
  "6ff65b3e-9e28-40fe-9819-624168713cc8",
  "8ae33297-7924-4e00-b7c6-94fab97e1323",
];

function allowedUserIds(env: Partial<Record<string, string>>): Set<string> {
  const ids = (env.BOOK_FILE_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  return new Set(ids.length > 0 ? ids : DEFAULT_BOOK_FILE_USER_IDS);
}

/** True when this user can see, upload, and remove book files. */
export function canUseBookFile(
  userId: string | null | undefined,
  env: Partial<Record<string, string>> = process.env,
): boolean {
  if (!userId) return false;
  return allowedUserIds(env).has(userId.trim().toLowerCase());
}

/**
 * The device that reads the book files of a user.
 *
 * - `kobo`: the file becomes a KEPUB in GOOGLE_DRIVE_FOLDER_ID. That folder is
 *   public, and a Kobo device syncs every file in it.
 * - `kindle`: the file stays a plain EPUB in GOOGLE_DRIVE_KINDLE_FOLDER_ID.
 *   That folder is private. KOReader gets the file from the OPDS catalog.
 *
 * `BOOK_FILE_KINDLE_USER_IDS` lists the kindle users. Use a comma to separate
 * two or more ids. When the variable is unset or empty, the code default
 * applies. All other users get `kobo`.
 */
export type BookFileTarget = "kindle" | "kobo";

const DEFAULT_BOOK_FILE_KINDLE_USER_IDS = ["6ff65b3e-9e28-40fe-9819-624168713cc8"];

function kindleUserIds(env: Partial<Record<string, string>>): Set<string> {
  const ids = (env.BOOK_FILE_KINDLE_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  return new Set(ids.length > 0 ? ids : DEFAULT_BOOK_FILE_KINDLE_USER_IDS);
}

/** The device target for the book files of this user. */
export function bookFileTarget(
  userId: string | null | undefined,
  env: Partial<Record<string, string>> = process.env,
): BookFileTarget {
  if (!userId) return "kobo";
  return kindleUserIds(env).has(userId.trim().toLowerCase()) ? "kindle" : "kobo";
}

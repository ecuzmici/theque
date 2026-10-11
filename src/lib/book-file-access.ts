/**
 * Allow-list for the book file field (the "Kobo file" block on item detail)
 * and for the book file route.
 *
 * All uploads go to one Google Drive folder. That folder syncs to one Kobo
 * device, so only the accounts on this list can upload or remove a book file.
 * The check runs on the server only.
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

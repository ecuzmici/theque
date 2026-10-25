/**
 * The browser sends a book file to this private bucket first. A Vercel Function
 * refuses a request body above 4.5 MB, so the file cannot go through the route.
 */
export const BOOK_UPLOAD_BUCKET = "book-uploads";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** One object per upload. The random part stops two uploads from colliding. */
export function bookUploadPath(userId: string, itemId: string, uploadId: string): string {
  return `${userId}/${itemId}/${uploadId}.epub`;
}

/**
 * Accept only a path that the upload URL route made for this user and item.
 * Without this test, a caller could make the route read the file of another user.
 */
export function isOwnBookUploadPath(path: unknown, userId: string, itemId: string): path is string {
  if (typeof path !== "string") return false;
  const prefix = `${userId}/${itemId}/`;
  if (!path.startsWith(prefix)) return false;
  return new RegExp(`^${UUID}\\.epub$`).test(path.slice(prefix.length));
}

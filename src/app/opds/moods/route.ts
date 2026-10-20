import { OPDS_NAVIGATION_TYPE, tasteFeed } from "@/lib/opds/feed";
import { authenticateOpds, loadOpdsBooks, opdsXml, requestOrigin } from "@/lib/opds/server";

/** The moods that hold at least one book, with the count of each. */
export async function GET(req: Request) {
  const auth = await authenticateOpds(req);
  if (auth instanceof Response) return auth;

  const rows = await loadOpdsBooks(auth.userId);
  return opdsXml(
    tasteFeed("mood", rows, requestOrigin(req), new Date().toISOString()),
    OPDS_NAVIGATION_TYPE,
  );
}

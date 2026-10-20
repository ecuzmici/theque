import { OPDS_NAVIGATION_TYPE, rootFeed } from "@/lib/opds/feed";
import { authenticateOpds, loadOpdsBooks, opdsXml, requestOrigin } from "@/lib/opds/server";

/** The root of the OPDS catalog for KOReader. See docs/kindle-opds.md. */
export async function GET(req: Request) {
  const auth = await authenticateOpds(req);
  if (auth instanceof Response) return auth;

  const rows = await loadOpdsBooks(auth.userId);
  return opdsXml(rootFeed(rows, requestOrigin(req), new Date().toISOString()), OPDS_NAVIGATION_TYPE);
}

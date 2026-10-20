import { newBooksFeed, OPDS_ACQUISITION_TYPE } from "@/lib/opds/feed";
import { authenticateOpds, loadOpdsBooks, opdsXml, requestOrigin } from "@/lib/opds/server";

/**
 * The KOReader sync catalog: every book with a file, newest upload first.
 * Never filter this feed. A sync stops at the entry it saved last time.
 */
export async function GET(req: Request) {
  const auth = await authenticateOpds(req);
  if (auth instanceof Response) return auth;

  const rows = await loadOpdsBooks(auth.userId);
  return opdsXml(newBooksFeed(rows, requestOrigin(req), new Date().toISOString()), OPDS_ACQUISITION_TYPE);
}

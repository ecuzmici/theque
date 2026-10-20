import { booksFeed, OPDS_ACQUISITION_TYPE, parseBookQuery } from "@/lib/opds/feed";
import { authenticateOpds, loadOpdsBooks, opdsText, opdsXml, requestOrigin } from "@/lib/opds/server";

/** An acquisition feed: `?shelf=up-next|finished|all`, with an optional `mood` or `genre` key. */
export async function GET(req: Request) {
  const auth = await authenticateOpds(req);
  if (auth instanceof Response) return auth;

  const query = parseBookQuery(new URL(req.url).searchParams);
  if (!query) return opdsText("Not found", 404);

  const rows = await loadOpdsBooks(auth.userId);
  return opdsXml(
    booksFeed(rows, query, requestOrigin(req), new Date().toISOString()),
    OPDS_ACQUISITION_TYPE,
  );
}

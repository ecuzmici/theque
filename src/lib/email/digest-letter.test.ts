import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { verifyRatingToken } from "./rating-link";
import {
  DIGEST_FORGOTTEN_COUNT,
  DIGEST_RATING_PROMPT_COUNT,
  buildDigestLetterContent,
  hasDigestContent,
  unsubscribeUrl,
  type DigestDb,
  type DigestLetter,
} from "./digest-letter";

const APP_URL = "https://theque.app";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const WANT_ID = "33333333-3333-4333-8333-333333333333";
const DONE_ID = "44444444-4444-4444-8444-444444444444";

const WANT_ROW = {
  id: WANT_ID,
  title: "The Dispossessed",
  domain: "goodreads.com",
  category: "books",
  created_at: "2026-01-02T00:00:00.000Z",
};

const DONE_ROW = {
  id: DONE_ID,
  title: "Chungking Express",
  domain: "imdb.com",
  category: "movies_and_tv",
  done_at: "2026-07-20T00:00:00.000Z",
};

type Query = {
  table: string;
  select: string;
  eq: Record<string, unknown>;
  flags: string[];
  limit?: number;
};

/**
 * Stand-in for the PostgREST builder. `buildDigestLetterContent` fires both
 * queries in parallel, so each `from()` gets its own recorded chain and the
 * result is picked from the recorded filters.
 */
function makeDb(
  rows: { want?: unknown[]; done?: unknown[] } = {},
  options: { error?: string } = {},
) {
  const queries: Query[] = [];

  const from = (table: string) => {
    const query: Query = { table, select: "", eq: {}, flags: [] };
    queries.push(query);

    const chain: Record<string, unknown> = {
      select: (cols: string) => {
        query.select = cols;
        return chain;
      },
      eq: (column: string, value: unknown) => {
        query.eq[column] = value;
        return chain;
      },
      is: (column: string) => {
        query.flags.push(`is:${column}`);
        return chain;
      },
      not: (column: string) => {
        query.flags.push(`not:${column}`);
        return chain;
      },
      order: () => chain,
      limit: (value: number) => {
        query.limit = value;
        return chain;
      },
      then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        const error = options.error ? { message: options.error } : null;
        const data = error
          ? null
          : query.eq.status === "want"
            ? (rows.want ?? [])
            : (rows.done ?? []);
        return Promise.resolve({ data, error }).then(onFulfilled, onRejected);
      },
    };

    return chain;
  };

  return { db: { from } as unknown as DigestDb, queries };
}

function makeLetter(overrides: Partial<DigestLetter> = {}): DigestLetter {
  return {
    forgotten: [],
    ratingPrompts: [],
    recommendation: null,
    appUrl: APP_URL,
    unsubscribeUrl: `${APP_URL}/unsubscribe/token-1`,
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.RATING_LINK_SECRET = "digest-letter-test-secret";
});

describe("buildDigestLetterContent", () => {
  it("scopes every query to the requested user", async () => {
    const { db, queries } = makeDb({ want: [WANT_ROW], done: [DONE_ROW] });

    await buildDigestLetterContent(db, { userId: USER, appUrl: APP_URL });

    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(query.table).toBe("items");
      expect(query.eq.user_id).toBe(USER);
    }
  });

  it("asks for the oldest wants and the most recent unrated dones, capped", async () => {
    const { db, queries } = makeDb();

    await buildDigestLetterContent(db, { userId: USER, appUrl: APP_URL });

    const forgotten = queries.find((query) => query.eq.status === "want");
    const unrated = queries.find((query) => query.eq.status === "done");

    expect(forgotten?.limit).toBe(DIGEST_FORGOTTEN_COUNT);
    expect(unrated?.limit).toBe(DIGEST_RATING_PROMPT_COUNT);
    expect(unrated?.flags).toContain("is:rating_personal");
    expect(unrated?.flags).toContain("not:done_at");
  });

  it("mints five signed star links per unrated item, bound to that user", async () => {
    const { db } = makeDb({ want: [WANT_ROW], done: [DONE_ROW] });

    const content = await buildDigestLetterContent(db, { userId: USER, appUrl: APP_URL });

    expect(content.forgotten).toEqual([WANT_ROW]);
    expect(content.ratingPrompts).toHaveLength(1);

    const [prompt] = content.ratingPrompts;
    expect(prompt.starLinks.map((link) => link.stars)).toEqual([1, 2, 3, 4, 5]);

    for (const link of prompt.starLinks) {
      expect(link.url.startsWith(`${APP_URL}/rate/`)).toBe(true);
      const verification = verifyRatingToken(link.url.split("/rate/")[1]);
      expect(verification.ok).toBe(true);
      if (!verification.ok) return;
      expect(verification.payload.userId).toBe(USER);
      expect(verification.payload.itemId).toBe(DONE_ID);
      expect(verification.payload.stars).toBe(link.stars);
    }
  });

  it("never mints a link for another profile's user id", async () => {
    const { db } = makeDb({ done: [DONE_ROW] });

    const content = await buildDigestLetterContent(db, { userId: USER, appUrl: APP_URL });
    const token = content.ratingPrompts[0].starLinks[0].url.split("/rate/")[1];
    const verification = verifyRatingToken(token);

    expect(verification.ok).toBe(true);
    if (!verification.ok) return;
    expect(verification.payload.userId).not.toBe(OTHER_USER);
  });

  it("drops the rating section rather than sending dead links when the secret is missing", async () => {
    delete process.env.RATING_LINK_SECRET;
    const { db } = makeDb({ want: [WANT_ROW], done: [DONE_ROW] });

    const content = await buildDigestLetterContent(db, { userId: USER, appUrl: APP_URL });

    expect(content.ratingPrompts).toEqual([]);
    expect(content.forgotten).toEqual([WANT_ROW]);
  });

  it("fails soft to empty sections when the queries error", async () => {
    const { db } = makeDb({}, { error: "relation does not exist" });

    await expect(buildDigestLetterContent(db, { userId: USER, appUrl: APP_URL })).resolves.toEqual({
      forgotten: [],
      ratingPrompts: [],
    });
  });
});

describe("hasDigestContent", () => {
  it("is false when there is nothing worth saying", () => {
    expect(hasDigestContent(makeLetter())).toBe(false);
  });

  it("is true when any single section has content", () => {
    expect(hasDigestContent(makeLetter({ forgotten: [WANT_ROW] as never }))).toBe(true);
    expect(
      hasDigestContent(
        makeLetter({ ratingPrompts: [{ ...DONE_ROW, starLinks: [] }] as never }),
      ),
    ).toBe(true);
    expect(
      hasDigestContent(
        makeLetter({
          recommendation: {
            shelf_id: "books",
            title: "Solaris",
            subtitle: "Stanisław Lem · 1961",
            description: "",
            reason: "",
            canonical_url: "https://openlibrary.org/works/OL1W",
            cover_url: null,
          },
        }),
      ),
    ).toBe(true);
  });
});

describe("unsubscribeUrl", () => {
  it("builds a public, token-keyed URL", () => {
    expect(unsubscribeUrl(APP_URL, "abc123")).toBe("https://theque.app/unsubscribe/abc123");
  });

  it("tolerates a trailing slash and encodes the token", () => {
    expect(unsubscribeUrl(`${APP_URL}/`, "a b/c")).toBe("https://theque.app/unsubscribe/a%20b%2Fc");
  });
});

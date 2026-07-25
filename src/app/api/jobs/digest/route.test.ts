import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DigestRecipient } from "@/lib/profiles/profiles";

const mocks = vi.hoisted(() => ({
  listProfilesDueForDigest: vi.fn(),
  markDigestSent: vi.fn(),
  createProfilesAdminClient: vi.fn(),
  generateRecommendations: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/profiles/profiles", () => ({
  listProfilesDueForDigest: mocks.listProfilesDueForDigest,
  markDigestSent: mocks.markDigestSent,
  createProfilesAdminClient: mocks.createProfilesAdminClient,
}));

vi.mock("@/lib/recommend/generate", () => ({
  generateRecommendations: mocks.generateRecommendations,
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const ITEM_A_WANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ITEM_A_DONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const ITEM_B_WANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

type Library = {
  want?: Array<Record<string, unknown>>;
  done?: Array<Record<string, unknown>>;
  categories?: string[];
};

/** Recipients are non-consenting unless a test opts them in, like real rows. */
function recipient(
  userId: string,
  token: string,
  aiPersonalizationEnabled = false,
): DigestRecipient {
  return {
    user_id: userId,
    email: `${userId}@example.com`,
    unsubscribe_token: token,
    digest_day: 0,
    last_digest_sent_at: null,
    ai_personalization_enabled: aiPersonalizationEnabled,
  };
}

/**
 * Fake admin client backed by a per-user library, so a query that forgets its
 * `user_id` filter returns nothing rather than silently leaking another
 * profile's rows.
 */
function makeAdminDb(libraries: Record<string, Library>) {
  const from = (table: string) => {
    const state: { userId?: string; status?: unknown; select: string; grouped: boolean } = {
      select: "",
      grouped: false,
    };

    const chain: Record<string, unknown> = {
      select: (cols: string) => {
        state.select = cols;
        return chain;
      },
      eq: (column: string, value: unknown) => {
        if (column === "user_id") state.userId = String(value);
        if (column === "status") state.status = value;
        return chain;
      },
      is: () => chain,
      not: () => chain,
      in: () => {
        state.grouped = true;
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        const library = (state.userId && libraries[state.userId]) || {};
        const data = state.grouped
          ? (library.categories ?? []).map((category) => ({ category }))
          : state.status === "want"
            ? (library.want ?? [])
            : (library.done ?? []);
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      },
    };

    expect(table).toBe("items");
    return chain;
  };

  return { from };
}

function cronRequest(path = "/api/jobs/digest") {
  return new Request(`https://theque.app${path}`, {
    headers: { Authorization: "Bearer cron-test-secret" },
  });
}

const wantRow = (id: string, title: string) => ({
  id,
  title,
  domain: "goodreads.com",
  category: "books",
  created_at: "2026-01-02T00:00:00.000Z",
});

const doneRow = (id: string, title: string) => ({
  id,
  title,
  domain: "imdb.com",
  category: "movies_and_tv",
  done_at: "2026-07-20T00:00:00.000Z",
});

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  mocks.listProfilesDueForDigest.mockReset();
  mocks.markDigestSent.mockReset().mockResolvedValue(true);
  mocks.createProfilesAdminClient.mockReset();
  mocks.generateRecommendations.mockReset();
  mocks.rateLimit.mockReset().mockResolvedValue({ ok: true });

  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});

  process.env.CRON_SECRET = "cron-test-secret";
  process.env.RATING_LINK_SECRET = "digest-route-test-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://theque.app";
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.DIGEST_MAX_RECIPIENTS;
  delete process.env.DIGEST_RECOMMEND_MAX_USERS;

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("/api/jobs/digest auth", () => {
  it("rejects a request without the cron secret", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("https://theque.app/api/jobs/digest"));

    expect(res.status).toBe(401);
    expect(mocks.listProfilesDueForDigest).not.toHaveBeenCalled();
  });
});

describe("/api/jobs/digest cadence", () => {
  it("asks only for profiles that are due, capped at the per-run ceiling", async () => {
    process.env.DIGEST_MAX_RECIPIENTS = "2";
    mocks.createProfilesAdminClient.mockReturnValue(makeAdminDb({}));
    mocks.listProfilesDueForDigest.mockResolvedValue([]);

    const { POST } = await import("./route");
    const res = await POST(cronRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ due: 0, sent: 0 });

    const [, options] = mocks.listProfilesDueForDigest.mock.calls[0];
    expect(options.limit).toBe(2);
    expect(options.now).toBeInstanceOf(Date);
  });

  it("sends nothing at all when the recipient cap is zero", async () => {
    process.env.DIGEST_MAX_RECIPIENTS = "0";
    mocks.createProfilesAdminClient.mockReturnValue(makeAdminDb({}));

    const { GET } = await import("./route");
    const res = await GET(cronRequest());

    await expect(res.json()).resolves.toMatchObject({ reason: "recipient_cap_zero", sent: 0 });
    expect(mocks.listProfilesDueForDigest).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stamps last_digest_sent_at only after a confirmed send", async () => {
    mocks.createProfilesAdminClient.mockReturnValue(
      makeAdminDb({ [USER_A]: { want: [wantRow(ITEM_A_WANT, "The Dispossessed")] } }),
    );
    mocks.listProfilesDueForDigest.mockResolvedValue([recipient(USER_A, "token-a")]);

    const { GET } = await import("./route");
    const res = await GET(cronRequest());

    await expect(res.json()).resolves.toMatchObject({ sent: 1 });
    expect(mocks.markDigestSent).toHaveBeenCalledTimes(1);
    expect(mocks.markDigestSent.mock.calls[0][1]).toBe(USER_A);
  });

  it("does not stamp when the provider rejects the send", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 422 })));
    mocks.createProfilesAdminClient.mockReturnValue(
      makeAdminDb({ [USER_A]: { want: [wantRow(ITEM_A_WANT, "The Dispossessed")] } }),
    );
    mocks.listProfilesDueForDigest.mockResolvedValue([recipient(USER_A, "token-a")]);

    const { GET } = await import("./route");
    const res = await GET(cronRequest());

    await expect(res.json()).resolves.toMatchObject({
      sent: 0,
      recipients: [{ user_id: USER_A, sent: false, reason: "send_failed" }],
    });
    expect(mocks.markDigestSent).not.toHaveBeenCalled();
  });
});

describe("/api/jobs/digest per-user scoping", () => {
  it("never puts one profile's items in another profile's letter", async () => {
    mocks.createProfilesAdminClient.mockReturnValue(
      makeAdminDb({
        [USER_A]: {
          want: [wantRow(ITEM_A_WANT, "A-only title")],
          done: [doneRow(ITEM_A_DONE, "A-only film")],
        },
        [USER_B]: { want: [wantRow(ITEM_B_WANT, "B-only title")] },
      }),
    );
    mocks.listProfilesDueForDigest.mockResolvedValue([
      recipient(USER_A, "token-a"),
      recipient(USER_B, "token-b"),
    ]);

    const { GET } = await import("./route");
    const res = await GET(cronRequest("/api/jobs/digest?dry=1"));
    const body = (await res.json()) as { recipients: Array<{ user_id: string; html: string }> };

    const letterA = body.recipients.find((row) => row.user_id === USER_A)!;
    const letterB = body.recipients.find((row) => row.user_id === USER_B)!;

    expect(letterA.html).toContain("A-only title");
    expect(letterA.html).not.toContain("B-only title");
    expect(letterB.html).toContain("B-only title");
    expect(letterB.html).not.toContain("A-only title");
    expect(letterB.html).not.toContain("A-only film");
  });

  it("gives each recipient their own unsubscribe token", async () => {
    mocks.createProfilesAdminClient.mockReturnValue(
      makeAdminDb({
        [USER_A]: { want: [wantRow(ITEM_A_WANT, "A-only title")] },
        [USER_B]: { want: [wantRow(ITEM_B_WANT, "B-only title")] },
      }),
    );
    mocks.listProfilesDueForDigest.mockResolvedValue([
      recipient(USER_A, "token-a"),
      recipient(USER_B, "token-b"),
    ]);

    const { GET } = await import("./route");
    const body = (await (await GET(cronRequest("/api/jobs/digest?dry=1"))).json()) as {
      recipients: Array<{ user_id: string; html: string }>;
    };

    const letterA = body.recipients.find((row) => row.user_id === USER_A)!;
    expect(letterA.html).toContain("/unsubscribe/token-a");
    expect(letterA.html).not.toContain("/unsubscribe/token-b");
  });
});

describe("/api/jobs/digest dry run", () => {
  it("renders every letter and sends nothing", async () => {
    mocks.createProfilesAdminClient.mockReturnValue(
      makeAdminDb({ [USER_A]: { want: [wantRow(ITEM_A_WANT, "The Dispossessed")] } }),
    );
    mocks.listProfilesDueForDigest.mockResolvedValue([recipient(USER_A, "token-a")]);

    const { GET } = await import("./route");
    const res = await GET(cronRequest("/api/jobs/digest?dry=1"));
    const body = (await res.json()) as {
      dry: boolean;
      sent: number;
      recipients: Array<{ reason: string; subject: string; html: string }>;
    };

    expect(body.dry).toBe(true);
    expect(body.sent).toBe(0);
    expect(body.recipients[0].reason).toBe("dry_run");
    expect(body.recipients[0].subject).toContain("The Dispossessed");
    expect(body.recipients[0].html).toContain("The Dispossessed");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.markDigestSent).not.toHaveBeenCalled();
  });

  it("skips recommendation generation (and its writes) unless explicitly asked", async () => {
    process.env.DIGEST_RECOMMEND_MAX_USERS = "5";
    mocks.createProfilesAdminClient.mockReturnValue(
      makeAdminDb({ [USER_A]: { want: [wantRow(ITEM_A_WANT, "The Dispossessed")] } }),
    );
    mocks.listProfilesDueForDigest.mockResolvedValue([recipient(USER_A, "token-a", true)]);

    const { GET } = await import("./route");
    await GET(cronRequest("/api/jobs/digest?dry=1"));

    expect(mocks.generateRecommendations).not.toHaveBeenCalled();
  });
});

describe("/api/jobs/digest nothing to say", () => {
  it("sends no letter to a profile with an empty library", async () => {
    mocks.createProfilesAdminClient.mockReturnValue(makeAdminDb({ [USER_A]: {} }));
    mocks.listProfilesDueForDigest.mockResolvedValue([recipient(USER_A, "token-a")]);

    const { GET } = await import("./route");
    const res = await GET(cronRequest());

    await expect(res.json()).resolves.toMatchObject({
      sent: 0,
      recipients: [{ user_id: USER_A, sent: false, reason: "nothing_to_say" }],
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.markDigestSent).not.toHaveBeenCalled();
  });
});

describe("/api/jobs/digest recommendations", () => {
  /** Gateway configured and USER_A opted in — the happy path for a card. */
  const withGateway = (library: Library) => {
    process.env.AI_GATEWAY_API_KEY = "gw_test";
    process.env.TMDB_API_KEY = "tmdb_test";
    mocks.createProfilesAdminClient.mockReturnValue(makeAdminDb({ [USER_A]: library }));
    mocks.listProfilesDueForDigest.mockResolvedValue([recipient(USER_A, "token-a", true)]);
  };

  const card = {
    id: "card-1",
    outcome_id: "outcome-1",
    title: "Solaris",
    subtitle: "Stanisław Lem · 1961",
    description: "A planet that reads minds.",
    reason: "Because you rated The Dispossessed highly.",
    canonical_url: "https://openlibrary.org/works/OL1W",
    cover_url: null,
    search_query: "Solaris book",
    source: "open_library" as const,
  };

  it("never calls the LLM for a profile that has not consented, and still sends the letter", async () => {
    process.env.DIGEST_RECOMMEND_MAX_USERS = "5";
    process.env.AI_GATEWAY_API_KEY = "gw_test";
    process.env.TMDB_API_KEY = "tmdb_test";
    mocks.createProfilesAdminClient.mockReturnValue(
      makeAdminDb({
        [USER_A]: {
          want: [wantRow(ITEM_A_WANT, "The Dispossessed")],
          categories: ["books", "books", "books"],
        },
      }),
    );
    // Budget to spare, a big enough library, gateway configured — the only thing
    // missing is consent, and that alone must stop the request from being made.
    mocks.listProfilesDueForDigest.mockResolvedValue([recipient(USER_A, "token-a", false)]);

    const { GET } = await import("./route");
    const res = await GET(cronRequest());

    await expect(res.json()).resolves.toMatchObject({ sent: 1 });
    expect(mocks.generateRecommendations).not.toHaveBeenCalled();
  });

  it("spends the card on the consenting recipient and skips the other one", async () => {
    process.env.DIGEST_RECOMMEND_MAX_USERS = "5";
    process.env.AI_GATEWAY_API_KEY = "gw_test";
    process.env.TMDB_API_KEY = "tmdb_test";
    const library: Library = {
      want: [wantRow(ITEM_A_WANT, "A title")],
      categories: ["books", "books", "books"],
    };
    mocks.createProfilesAdminClient.mockReturnValue(
      makeAdminDb({
        [USER_A]: library,
        [USER_B]: { ...library, want: [wantRow(ITEM_B_WANT, "B title")] },
      }),
    );
    mocks.listProfilesDueForDigest.mockResolvedValue([
      recipient(USER_A, "token-a", false),
      recipient(USER_B, "token-b", true),
    ]);
    mocks.generateRecommendations.mockResolvedValue({ ok: true, cards: [card], funnel: {} });

    const { GET } = await import("./route");
    await expect((await GET(cronRequest())).json()).resolves.toMatchObject({ sent: 2 });

    expect(mocks.generateRecommendations).toHaveBeenCalledTimes(1);
    expect(mocks.generateRecommendations.mock.calls[0][0]).toMatchObject({ userId: USER_B });
  });

  it("caps how many consenting recipients get a generated card in one run", async () => {
    process.env.DIGEST_RECOMMEND_MAX_USERS = "1";
    process.env.AI_GATEWAY_API_KEY = "gw_test";
    process.env.TMDB_API_KEY = "tmdb_test";
    const library: Library = {
      want: [wantRow(ITEM_A_WANT, "A title")],
      categories: ["books", "books", "books"],
    };
    mocks.createProfilesAdminClient.mockReturnValue(
      makeAdminDb({ [USER_A]: library, [USER_B]: { ...library, want: [wantRow(ITEM_B_WANT, "B title")] } }),
    );
    // Both consented: the cap is an independent ceiling on top of consent, not a
    // substitute for it.
    mocks.listProfilesDueForDigest.mockResolvedValue([
      recipient(USER_A, "token-a", true),
      recipient(USER_B, "token-b", true),
    ]);
    mocks.generateRecommendations.mockResolvedValue({ ok: true, cards: [card], funnel: {} });

    const { GET } = await import("./route");
    const res = await GET(cronRequest());

    await expect(res.json()).resolves.toMatchObject({ sent: 2 });
    expect(mocks.generateRecommendations).toHaveBeenCalledTimes(1);
  });

  it("uses its own rate-limit bucket, not the interactive deck's", async () => {
    process.env.DIGEST_RECOMMEND_MAX_USERS = "1";
    withGateway({ want: [wantRow(ITEM_A_WANT, "A title")], categories: ["books", "books", "books"] });
    mocks.generateRecommendations.mockResolvedValue({ ok: true, cards: [card], funnel: {} });

    const { GET } = await import("./route");
    await GET(cronRequest());

    const [key] = mocks.rateLimit.mock.calls[0];
    expect(key).toBe(`digest:recommend:${USER_A}`);
    expect(key).not.toBe(`recommend:${USER_A}`);
  });

  it("fails open: the letter still goes out when generation throws", async () => {
    process.env.DIGEST_RECOMMEND_MAX_USERS = "1";
    withGateway({ want: [wantRow(ITEM_A_WANT, "The Dispossessed")], categories: ["books", "books", "books"] });
    mocks.generateRecommendations.mockRejectedValue(new Error("gateway exploded"));

    const { GET } = await import("./route");
    const res = await GET(cronRequest());

    await expect(res.json()).resolves.toMatchObject({ sent: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fails open on a pipeline error code and on an empty-but-successful run", async () => {
    process.env.DIGEST_RECOMMEND_MAX_USERS = "1";
    withGateway({ want: [wantRow(ITEM_A_WANT, "The Dispossessed")], categories: ["books", "books", "books"] });
    mocks.generateRecommendations.mockResolvedValue({ ok: false, code: "llm_failed" });

    const { GET } = await import("./route");
    await expect((await GET(cronRequest())).json()).resolves.toMatchObject({ sent: 1 });

    vi.resetModules();
    mocks.generateRecommendations.mockResolvedValue({ ok: true, cards: [], reason: "exhausted", funnel: {} });
    const again = await import("./route");
    await expect((await again.GET(cronRequest())).json()).resolves.toMatchObject({ sent: 1 });
  });

  it("skips the LLM entirely for a library below the minimum item floor", async () => {
    process.env.DIGEST_RECOMMEND_MAX_USERS = "1";
    withGateway({ want: [wantRow(ITEM_A_WANT, "The Dispossessed")], categories: ["books"] });

    const { GET } = await import("./route");
    await GET(cronRequest());

    expect(mocks.generateRecommendations).not.toHaveBeenCalled();
  });

  it("puts the card in the letter when it is allowed and succeeds", async () => {
    process.env.DIGEST_RECOMMEND_MAX_USERS = "1";
    withGateway({ want: [wantRow(ITEM_A_WANT, "The Dispossessed")], categories: ["books", "books", "books"] });
    mocks.generateRecommendations.mockResolvedValue({ ok: true, cards: [card], funnel: {} });

    const { GET } = await import("./route");
    const body = (await (await GET(cronRequest("/api/jobs/digest?dry=1&recommend=1"))).json()) as {
      recipients: Array<{ html: string; sections: { recommendation: boolean } }>;
    };

    expect(body.recipients[0].sections.recommendation).toBe(true);
    expect(body.recipients[0].html).toContain("Solaris");
    expect(mocks.generateRecommendations.mock.calls[0][0]).toMatchObject({
      userId: USER_A,
      count: 1,
    });
  });
});

describe("/api/jobs/digest one-click unsubscribe headers", () => {
  it("sends List-Unsubscribe and List-Unsubscribe-Post to the recipient's own token", async () => {
    mocks.createProfilesAdminClient.mockReturnValue(
      makeAdminDb({ [USER_A]: { want: [wantRow(ITEM_A_WANT, "The Dispossessed")] } }),
    );
    mocks.listProfilesDueForDigest.mockResolvedValue([recipient(USER_A, "token-a")]);

    const { GET } = await import("./route");
    await GET(cronRequest());

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const payload = JSON.parse(init.body as string);

    expect(payload.to).toEqual([`${USER_A}@example.com`]);
    expect(payload.headers["List-Unsubscribe"]).toBe(
      "<https://theque.app/unsubscribe/token-a>",
    );
    expect(payload.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("reports instead of sending when no mail provider is configured", async () => {
    delete process.env.RESEND_API_KEY;
    mocks.createProfilesAdminClient.mockReturnValue(
      makeAdminDb({ [USER_A]: { want: [wantRow(ITEM_A_WANT, "The Dispossessed")] } }),
    );
    mocks.listProfilesDueForDigest.mockResolvedValue([recipient(USER_A, "token-a")]);

    const { GET } = await import("./route");
    const res = await GET(cronRequest());

    await expect(res.json()).resolves.toMatchObject({
      recipients: [{ sent: false, reason: "email_not_configured" }],
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.markDigestSent).not.toHaveBeenCalled();
  });
});

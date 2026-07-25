import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disableDigestByUnsubscribeToken: vi.fn(),
  createProfilesAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/profiles/profiles", () => ({
  disableDigestByUnsubscribeToken: mocks.disableDigestByUnsubscribeToken,
  createProfilesAdminClient: mocks.createProfilesAdminClient,
}));

import { GET, POST } from "./route";

const TOKEN = "unsub-token-1";

function params(token: string) {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => {
  mocks.disableDigestByUnsubscribeToken.mockReset();
  mocks.createProfilesAdminClient.mockReset().mockReturnValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /unsubscribe/[token]", () => {
  it("confirms instead of unsubscribing, so a link scanner can't opt someone out", async () => {
    const res = await GET(new Request(`https://theque.app/unsubscribe/${TOKEN}`), params(TOKEN));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('method="post"');
    expect(html).toContain(`action="/unsubscribe/${TOKEN}"`);
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(mocks.disableDigestByUnsubscribeToken).not.toHaveBeenCalled();
  });
});

describe("POST /unsubscribe/[token]", () => {
  it("unsubscribes by token with no confirmation step (RFC 8058 one-click)", async () => {
    mocks.disableDigestByUnsubscribeToken.mockResolvedValue(true);

    const res = await POST(
      new Request(`https://theque.app/unsubscribe/${TOKEN}`, {
        method: "POST",
        body: "List-Unsubscribe=One-Click",
      }),
      params(TOKEN),
    );

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toContain("Unsubscribed");
    expect(mocks.disableDigestByUnsubscribeToken).toHaveBeenCalledWith({}, TOKEN);
  });

  it("reports a miss for an unknown token", async () => {
    mocks.disableDigestByUnsubscribeToken.mockResolvedValue(false);

    const res = await POST(
      new Request("https://theque.app/unsubscribe/nope", { method: "POST" }),
      params("nope"),
    );

    expect(res.status).toBe(404);
    await expect(res.text()).resolves.toContain("couldn't find that link");
  });

  it("does not leak an internal error when the admin client is unavailable", async () => {
    mocks.createProfilesAdminClient.mockImplementation(() => {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    });

    const res = await POST(
      new Request(`https://theque.app/unsubscribe/${TOKEN}`, { method: "POST" }),
      params(TOKEN),
    );

    expect(res.status).toBe(404);
    await expect(res.text()).resolves.not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

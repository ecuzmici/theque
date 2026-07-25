import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyDeliverabilitySignal: vi.fn(),
  createProfilesAdminClient: vi.fn(),
  claimWebhookEvent: vi.fn(),
  releaseWebhookEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/profiles/profiles", () => ({
  applyDeliverabilitySignal: mocks.applyDeliverabilitySignal,
  createProfilesAdminClient: mocks.createProfilesAdminClient,
}));

vi.mock("@/lib/email/webhook-events", () => ({
  claimWebhookEvent: mocks.claimWebhookEvent,
  releaseWebhookEvent: mocks.releaseWebhookEvent,
}));

import { POST } from "./route";

const SECRET = `whsec_${Buffer.from("theque-webhook-signing-key").toString("base64")}`;
const OTHER_SECRET = `whsec_${Buffer.from("a-completely-different-key").toString("base64")}`;

const ENDPOINT = "https://theque.app/api/webhooks/resend";

function sign(payload: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`, "utf8")
    .digest("base64");
}

type RequestOptions = {
  id?: string;
  timestampSeconds?: number;
  secret?: string;
  /** Body actually sent, when it must differ from the body that was signed. */
  sentBody?: string;
  headers?: Record<string, string | null>;
};

function signedRequest(event: unknown, options: RequestOptions = {}): Request {
  const {
    id = "msg_test_1",
    timestampSeconds = Math.floor(Date.now() / 1000),
    secret = SECRET,
    sentBody,
    headers: overrides = {},
  } = options;

  const signedBody = JSON.stringify(event);
  const timestamp = String(timestampSeconds);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${sign(signedBody, id, timestamp, secret)}`,
  };

  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) delete headers[name];
    else headers[name] = value;
  }

  return new Request(ENDPOINT, { method: "POST", headers, body: sentBody ?? signedBody });
}

function emailEvent(type: string, data: Record<string, unknown> = {}) {
  return {
    type,
    created_at: "2026-07-25T12:00:00.000Z",
    data: {
      email_id: "ae2014de-c168-4c61-8267-70d2662a1ce1",
      from: "theque <digest@theque.app>",
      to: ["reader@example.com"],
      subject: "Still on your shelves",
      ...data,
    },
  };
}

const HARD_BOUNCE = emailEvent("email.bounced", {
  bounce: { type: "Permanent", subType: "General", message: "550 no such user" },
});
const SOFT_BOUNCE = emailEvent("email.bounced", {
  bounce: { type: "Transient", subType: "MailboxFull", message: "552 mailbox full" },
});
const COMPLAINT = emailEvent("email.complained");
const DELIVERED = emailEvent("email.delivered");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  process.env.RESEND_WEBHOOK_SECRET = SECRET;
  mocks.createProfilesAdminClient.mockReturnValue({});
  mocks.applyDeliverabilitySignal.mockResolvedValue("suppressed");

  // A real in-memory claim check, so the route's de-duplication wiring is
  // exercised rather than assumed.
  const seen = new Set<string>();
  mocks.claimWebhookEvent.mockImplementation(async (_db: unknown, svixId: string) => {
    if (seen.has(svixId)) return "duplicate";
    seen.add(svixId);
    return "claimed";
  });
  mocks.releaseWebhookEvent.mockImplementation(async (_db: unknown, svixId: string) => {
    seen.delete(svixId);
  });
});

afterEach(() => {
  delete process.env.RESEND_WEBHOOK_SECRET;
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/resend — signature boundary", () => {
  it("accepts a correctly signed webhook", async () => {
    const res = await POST(signedRequest(HARD_BOUNCE));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, handled: true });
  });

  it("rejects a tampered body without acting on it", async () => {
    const tampered = JSON.stringify(
      emailEvent("email.bounced", {
        to: ["victim@example.com"],
        bounce: { type: "Permanent" },
      }),
    );
    const res = await POST(signedRequest(HARD_BOUNCE, { sentBody: tampered }));

    expect(res.status).toBe(401);
    expect(mocks.applyDeliverabilitySignal).not.toHaveBeenCalled();
    expect(mocks.claimWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects a signature made with the wrong secret", async () => {
    const res = await POST(signedRequest(HARD_BOUNCE, { secret: OTHER_SECRET }));

    expect(res.status).toBe(401);
    expect(mocks.applyDeliverabilitySignal).not.toHaveBeenCalled();
  });

  it("fails closed when RESEND_WEBHOOK_SECRET is unset", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    const res = await POST(signedRequest(HARD_BOUNCE));

    expect(res.status).toBe(401);
    expect(mocks.applyDeliverabilitySignal).not.toHaveBeenCalled();
  });

  it.each(["svix-id", "svix-timestamp", "svix-signature"])("rejects a missing %s", async (name) => {
    const res = await POST(signedRequest(HARD_BOUNCE, { headers: { [name]: null } }));

    expect(res.status).toBe(401);
    expect(mocks.applyDeliverabilitySignal).not.toHaveBeenCalled();
  });

  it("rejects a stale timestamp (replay of a captured request)", async () => {
    const res = await POST(
      signedRequest(HARD_BOUNCE, { timestampSeconds: Math.floor(Date.now() / 1000) - 3600 }),
    );

    expect(res.status).toBe(401);
    expect(mocks.applyDeliverabilitySignal).not.toHaveBeenCalled();
  });

  it("accepts a rotation header where only the second signature matches", async () => {
    const body = JSON.stringify(COMPLAINT);
    const id = "msg_rotation";
    const timestamp = String(Math.floor(Date.now() / 1000));

    const res = await POST(
      new Request(ENDPOINT, {
        method: "POST",
        headers: {
          "svix-id": id,
          "svix-timestamp": timestamp,
          "svix-signature": `v1,${sign(body, id, timestamp, OTHER_SECRET)} v1,${sign(body, id, timestamp)}`,
        },
        body,
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.applyDeliverabilitySignal).toHaveBeenCalledTimes(1);
  });

  it("never reveals why verification failed", async () => {
    const res = await POST(signedRequest(HARD_BOUNCE, { secret: OTHER_SECRET }));
    await expect(res.json()).resolves.toEqual({ code: "unauthorized" });
  });
});

describe("POST /api/webhooks/resend — event handling", () => {
  it("suppresses on a hard bounce", async () => {
    await POST(signedRequest(HARD_BOUNCE));

    expect(mocks.applyDeliverabilitySignal).toHaveBeenCalledWith(
      expect.anything(),
      { email: "reader@example.com", signal: "hard_bounce" },
    );
  });

  it("suppresses on a complaint", async () => {
    await POST(signedRequest(COMPLAINT));

    expect(mocks.applyDeliverabilitySignal).toHaveBeenCalledWith(
      expect.anything(),
      { email: "reader@example.com", signal: "complaint" },
    );
  });

  it("counts a transient bounce rather than suppressing", async () => {
    mocks.applyDeliverabilitySignal.mockResolvedValue("counted");

    await POST(signedRequest(SOFT_BOUNCE));

    expect(mocks.applyDeliverabilitySignal).toHaveBeenCalledWith(
      expect.anything(),
      { email: "reader@example.com", signal: "soft_bounce" },
    );
  });

  it("treats an unrecognized bounce type as hard", async () => {
    await POST(
      signedRequest(emailEvent("email.bounced", { bounce: { type: "Undetermined" } })),
    );

    expect(mocks.applyDeliverabilitySignal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ signal: "hard_bounce" }),
    );
  });

  it("resets the soft-bounce counter on a delivery", async () => {
    mocks.applyDeliverabilitySignal.mockResolvedValue("reset");

    await POST(signedRequest(DELIVERED));

    expect(mocks.applyDeliverabilitySignal).toHaveBeenCalledWith(
      expect.anything(),
      { email: "reader@example.com", signal: "delivered" },
    );
  });

  it("answers 2xx and does nothing for an event type it does not handle", async () => {
    const res = await POST(signedRequest(emailEvent("email.opened")));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, handled: false });
    expect(mocks.claimWebhookEvent).not.toHaveBeenCalled();
    expect(mocks.applyDeliverabilitySignal).not.toHaveBeenCalled();
  });

  it("answers 2xx for an unknown address and does not say it was unknown", async () => {
    mocks.applyDeliverabilitySignal.mockResolvedValue("no_match");

    const res = await POST(
      signedRequest(emailEvent("email.bounced", { to: ["stranger@example.com"] })),
    );

    expect(res.status).toBe(200);
    // Byte-identical to the matched case: the response is not an oracle.
    await expect(res.json()).resolves.toEqual({ received: true, handled: true });
  });

  it("answers 2xx for a signed body that is not JSON", async () => {
    const body = "not json at all";
    const id = "msg_bad_json";
    const timestamp = String(Math.floor(Date.now() / 1000));

    const res = await POST(
      new Request(ENDPOINT, {
        method: "POST",
        headers: {
          "svix-id": id,
          "svix-timestamp": timestamp,
          "svix-signature": `v1,${sign(body, id, timestamp)}`,
        },
        body,
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.applyDeliverabilitySignal).not.toHaveBeenCalled();
  });

  it("applies the signal to every recipient on the envelope", async () => {
    await POST(
      signedRequest(
        emailEvent("email.complained", { to: ["one@example.com", "two@example.com"] }),
      ),
    );

    expect(mocks.applyDeliverabilitySignal).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/webhooks/resend — idempotency", () => {
  it("does not act twice on a redelivered svix-id", async () => {
    const first = await POST(signedRequest(SOFT_BOUNCE, { id: "msg_retry" }));
    // Svix retries carry the same id with a fresh timestamp and signature.
    const second = await POST(
      signedRequest(SOFT_BOUNCE, {
        id: "msg_retry",
        timestampSeconds: Math.floor(Date.now() / 1000) + 30,
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({
      received: true,
      handled: true,
      duplicate: true,
    });
    expect(mocks.applyDeliverabilitySignal).toHaveBeenCalledTimes(1);
  });

  it("still acts on a different svix-id carrying the same event", async () => {
    await POST(signedRequest(SOFT_BOUNCE, { id: "msg_a" }));
    await POST(signedRequest(SOFT_BOUNCE, { id: "msg_b" }));

    expect(mocks.applyDeliverabilitySignal).toHaveBeenCalledTimes(2);
  });

  it("releases the claim and asks for a retry when applying fails", async () => {
    mocks.applyDeliverabilitySignal.mockResolvedValue("failed");

    const res = await POST(signedRequest(SOFT_BOUNCE, { id: "msg_flaky" }));

    expect(res.status).toBe(500);
    expect(mocks.releaseWebhookEvent).toHaveBeenCalledWith(expect.anything(), "msg_flaky");

    // The released claim lets the provider's retry do the work properly.
    mocks.applyDeliverabilitySignal.mockResolvedValue("counted");
    const retry = await POST(
      signedRequest(SOFT_BOUNCE, {
        id: "msg_flaky",
        timestampSeconds: Math.floor(Date.now() / 1000) + 30,
      }),
    );

    expect(retry.status).toBe(200);
    expect(mocks.applyDeliverabilitySignal).toHaveBeenCalledTimes(2);
  });

  it("asks for a retry rather than acting when the claim itself fails", async () => {
    mocks.claimWebhookEvent.mockResolvedValue("failed");

    const res = await POST(signedRequest(SOFT_BOUNCE));

    expect(res.status).toBe(500);
    expect(mocks.applyDeliverabilitySignal).not.toHaveBeenCalled();
  });

  it("asks for a retry when the admin client cannot be built", async () => {
    mocks.createProfilesAdminClient.mockImplementation(() => {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    });

    const res = await POST(signedRequest(HARD_BOUNCE));

    expect(res.status).toBe(500);
    expect(mocks.applyDeliverabilitySignal).not.toHaveBeenCalled();
  });
});

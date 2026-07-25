import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifyBounce,
  parseResendEvent,
  verifyResendWebhook,
  WEBHOOK_TOLERANCE_SECONDS,
} from "@/lib/email/resend-webhook";

/** A `whsec_`-prefixed secret, exactly as Resend hands it over. */
const SECRET = `whsec_${Buffer.from("theque-webhook-signing-key").toString("base64")}`;
const OTHER_SECRET = `whsec_${Buffer.from("a-completely-different-key").toString("base64")}`;

const SVIX_ID = "msg_2abcDEF456";
const NOW_MS = Date.UTC(2026, 6, 25, 12, 0, 0);
const TIMESTAMP = String(Math.floor(NOW_MS / 1000));

const BODY = JSON.stringify({
  type: "email.bounced",
  created_at: "2026-07-25T12:00:00.000Z",
  data: {
    email_id: "ae2014de-c168-4c61-8267-70d2662a1ce1",
    from: "theque <digest@theque.app>",
    to: ["reader@example.com"],
    subject: "Still on your shelves",
    bounce: { type: "Permanent", subType: "General", message: "550 no such user" },
  },
});

/** Sign the way Svix does: HMAC-SHA256 over `id.timestamp.body`, base64. */
function sign(
  payload: string,
  { id = SVIX_ID, timestamp = TIMESTAMP, secret = SECRET } = {},
): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`, "utf8").digest("base64");
}

function headers(overrides: Partial<Record<"id" | "timestamp" | "signature", string | null>> = {}) {
  return {
    id: SVIX_ID,
    timestamp: TIMESTAMP,
    signature: `v1,${sign(BODY)}`,
    ...overrides,
  };
}

function verify(
  payload = BODY,
  overrides: Parameters<typeof headers>[0] = {},
  secret: string | undefined = SECRET,
) {
  return verifyResendWebhook({ payload, headers: headers(overrides), secret, nowMs: NOW_MS });
}

describe("verifyResendWebhook", () => {
  it("accepts a correctly signed payload and returns the message id", () => {
    expect(verify()).toEqual({ ok: true, id: SVIX_ID });
  });

  it("accepts a secret supplied without the whsec_ prefix", () => {
    const bare = SECRET.replace(/^whsec_/, "");
    expect(verify(BODY, {}, bare)).toEqual({ ok: true, id: SVIX_ID });
  });

  it("rejects a tampered body", () => {
    // Same signature, one byte different in the payload.
    const tampered = BODY.replace("reader@example.com", "victim@example.com");
    expect(verifyResendWebhook({
      payload: tampered,
      headers: headers(),
      secret: SECRET,
      nowMs: NOW_MS,
    })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a signature made with a different secret", () => {
    const forged = `v1,${sign(BODY, { secret: OTHER_SECRET })}`;
    expect(verify(BODY, { signature: forged })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects verification against the wrong secret", () => {
    expect(verify(BODY, {}, OTHER_SECRET)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("fails closed when the secret is not configured", () => {
    // Passed explicitly rather than through the helper, whose default would
    // substitute the real secret for `undefined`.
    expect(
      verifyResendWebhook({ payload: BODY, headers: headers(), secret: undefined, nowMs: NOW_MS }),
    ).toEqual({ ok: false, reason: "missing_secret" });
    expect(verify(BODY, {}, "")).toEqual({ ok: false, reason: "missing_secret" });
  });

  it("fails closed on a secret whose payload is not base64", () => {
    expect(verify(BODY, {}, "whsec_not base64!!")).toEqual({
      ok: false,
      reason: "malformed_secret",
    });
  });

  it.each(["id", "timestamp", "signature"] as const)("rejects a missing svix-%s header", (name) => {
    expect(verify(BODY, { [name]: null })).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("rejects a non-numeric timestamp", () => {
    expect(verify(BODY, { timestamp: "not-a-number" })).toEqual({
      ok: false,
      reason: "malformed_timestamp",
    });
  });

  it("rejects an id containing the field separator", () => {
    expect(verify(BODY, { id: "msg.forged" })).toEqual({ ok: false, reason: "malformed_id" });
  });

  it("rejects a stale timestamp beyond the tolerance", () => {
    const stale = String(Math.floor(NOW_MS / 1000) - WEBHOOK_TOLERANCE_SECONDS - 1);
    expect(
      verifyResendWebhook({
        payload: BODY,
        headers: { id: SVIX_ID, timestamp: stale, signature: `v1,${sign(BODY, { timestamp: stale })}` },
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("rejects a timestamp too far in the future", () => {
    const future = String(Math.floor(NOW_MS / 1000) + WEBHOOK_TOLERANCE_SECONDS + 1);
    expect(
      verifyResendWebhook({
        payload: BODY,
        headers: {
          id: SVIX_ID,
          timestamp: future,
          signature: `v1,${sign(BODY, { timestamp: future })}`,
        },
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("accepts a timestamp at the edge of the tolerance", () => {
    const edge = String(Math.floor(NOW_MS / 1000) - WEBHOOK_TOLERANCE_SECONDS);
    expect(
      verifyResendWebhook({
        payload: BODY,
        headers: { id: SVIX_ID, timestamp: edge, signature: `v1,${sign(BODY, { timestamp: edge })}` },
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: true, id: SVIX_ID });
  });

  it("accepts when only the second signature in the header matches (key rotation)", () => {
    const rotated = `v1,${sign(BODY, { secret: OTHER_SECRET })} v1,${sign(BODY)}`;
    expect(verify(BODY, { signature: rotated })).toEqual({ ok: true, id: SVIX_ID });
  });

  it("ignores signature entries for other scheme versions", () => {
    // A correct MAC under an unknown version must not be honoured.
    expect(verify(BODY, { signature: `v2,${sign(BODY)}` })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a header of garbage entries", () => {
    expect(verify(BODY, { signature: "garbage without a comma" })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("verifies the raw bytes, not a re-serialized object", () => {
    // Re-serializing reorders/reformats and must break the signature — this is
    // the mistake the route is written to avoid.
    const reserialized = JSON.stringify(JSON.parse(BODY.replace(/"to":/, '"to" :')));
    const signedOverPretty = `v1,${sign(BODY.replace(/"to":/, '"to" :'))}`;
    expect(verify(reserialized, { signature: signedOverPretty })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });
});

describe("classifyBounce", () => {
  it("treats an explicit Transient bounce as soft", () => {
    expect(classifyBounce({ bounce: { type: "Transient", subType: "MailboxFull" } })).toBe(
      "soft_bounce",
    );
  });

  it("is case-insensitive about the bounce type", () => {
    expect(classifyBounce({ bounce: { type: "transient" } })).toBe("soft_bounce");
    expect(classifyBounce({ bounce: { type: "PERMANENT" } })).toBe("hard_bounce");
  });

  it("reads the flat bounce_type shape too", () => {
    expect(classifyBounce({ bounce_type: "soft" })).toBe("soft_bounce");
    expect(classifyBounce({ bounce_type: "hard" })).toBe("hard_bounce");
  });

  it.each([
    ["Permanent", { bounce: { type: "Permanent" } }],
    ["Undetermined", { bounce: { type: "Undetermined" } }],
    ["an unknown type", { bounce: { type: "Weird" } }],
    ["a missing type", { bounce: {} }],
    ["no bounce object at all", {}],
    ["a non-object bounce", { bounce: "Permanent" }],
  ])("defaults %s to a hard bounce", (_label, data) => {
    expect(classifyBounce(data as Record<string, unknown>)).toBe("hard_bounce");
  });
});

describe("parseResendEvent", () => {
  const data = { email_id: "e1", from: "a@b.c", to: ["Reader@Example.com"], subject: "s" };

  it("normalizes recipients to lowercase and de-duplicates them", () => {
    expect(
      parseResendEvent({
        type: "email.delivered",
        data: { ...data, to: [" Reader@Example.com ", "reader@example.com"] },
      }),
    ).toEqual({
      handled: true,
      type: "email.delivered",
      signal: "delivered",
      recipients: ["reader@example.com"],
    });
  });

  it("maps a complaint", () => {
    expect(parseResendEvent({ type: "email.complained", data })).toMatchObject({
      handled: true,
      signal: "complaint",
    });
  });

  it("maps a hard and a soft bounce", () => {
    expect(
      parseResendEvent({ type: "email.bounced", data: { ...data, bounce: { type: "Permanent" } } }),
    ).toMatchObject({ handled: true, signal: "hard_bounce" });
    expect(
      parseResendEvent({ type: "email.bounced", data: { ...data, bounce: { type: "Transient" } } }),
    ).toMatchObject({ handled: true, signal: "soft_bounce" });
  });

  it("accepts a bare `email` string when `to` is absent", () => {
    expect(
      parseResendEvent({ type: "email.complained", data: { email: "Solo@Example.com" } }),
    ).toMatchObject({ recipients: ["solo@example.com"] });
  });

  it.each([
    "email.sent",
    "email.opened",
    "email.clicked",
    // Resend retries transient trouble itself and emits email.bounced if it
    // ultimately fails, so counting this too would double-count.
    "email.delivery_delayed",
    "contact.created",
    "domain.updated",
  ])("reports %s as unhandled", (type) => {
    expect(parseResendEvent({ type, data })).toEqual({ handled: false, type });
  });

  it.each([
    ["a non-object body", "nope"],
    ["null", null],
    ["an array", []],
  ])("reports %s as unhandled", (_label, body) => {
    expect(parseResendEvent(body)).toEqual({ handled: false, type: null });
  });

  it("reports a handled type with no recipients as unhandled", () => {
    expect(parseResendEvent({ type: "email.bounced", data: { to: [] } })).toEqual({
      handled: false,
      type: "email.bounced",
    });
    expect(parseResendEvent({ type: "email.bounced" })).toEqual({
      handled: false,
      type: "email.bounced",
    });
  });
});

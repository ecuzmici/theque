import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  mintRatingToken,
  ratingLinkUrl,
  RATING_LINK_TTL_SECONDS,
  RATING_STARS,
  verifyRatingToken,
} from "@/lib/email/rating-link";

const SECRET = "test-rating-link-secret";
const OTHER_SECRET = "a-completely-different-secret";

const ITEM_ID = "11111111-2222-4333-8444-555555555555";
const USER_ID = "99999999-8888-4777-8666-555555555555";
const OTHER_ITEM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_USER_ID = "12345678-90ab-4cde-8f01-234567890abc";

const NOW_MS = Date.UTC(2026, 0, 1, 12, 0, 0);

/** Sign a payload the way the module does, so tests can forge tokens the minter refuses to make. */
function forgeToken(payloadFields: (string | number)[], secret = SECRET): string {
  const encoded = Buffer.from(payloadFields.join(":"), "utf8").toString("base64url");
  const signingInput = `rl.v1.${encoded}`;
  const signature = createHmac("sha256", secret).update(signingInput, "utf8").digest("base64url");
  return `${signingInput}.${signature}`;
}

function mint(overrides: Partial<Parameters<typeof mintRatingToken>[0]> = {}): string {
  return mintRatingToken({
    itemId: ITEM_ID,
    userId: USER_ID,
    stars: 4,
    nowMs: NOW_MS,
    ...overrides,
  });
}

beforeEach(() => {
  process.env.RATING_LINK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.RATING_LINK_SECRET;
});

describe("mint / verify roundtrip", () => {
  it.each(RATING_STARS)("roundtrips a %i-star token", (stars) => {
    const token = mint({ stars });
    const result = verifyRatingToken(token, NOW_MS);

    expect(result).toEqual({
      ok: true,
      payload: {
        itemId: ITEM_ID,
        userId: USER_ID,
        stars,
        expiresAtSeconds: Math.floor(NOW_MS / 1000) + RATING_LINK_TTL_SECONDS,
      },
    });
  });

  it("produces a URL-safe token (no padding, no path-breaking characters)", () => {
    const token = mint();
    expect(token).toMatch(/^rl\.v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(token)).toBe(token);
  });

  it("is deterministic for the same payload and secret", () => {
    expect(mint()).toBe(mint());
  });

  it("gives different tokens for different item, user, and star values", () => {
    const base = mint();
    expect(mint({ itemId: OTHER_ITEM_ID })).not.toBe(base);
    expect(mint({ userId: OTHER_USER_ID })).not.toBe(base);
    expect(mint({ stars: 5 })).not.toBe(base);
  });

  it("honours an explicit expiry so correction links inherit the original window", () => {
    const expiresAtSeconds = Math.floor(NOW_MS / 1000) + 600;
    const result = verifyRatingToken(mint({ stars: 2, expiresAtSeconds }), NOW_MS);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.expiresAtSeconds).toBe(expiresAtSeconds);
  });
});

describe("tamper resistance", () => {
  it("rejects a payload edited to name a different item", () => {
    const token = mint();
    const forgedPayload = Buffer.from(
      [OTHER_ITEM_ID, USER_ID, "4", String(Math.floor(NOW_MS / 1000) + 60)].join(":"),
      "utf8",
    ).toString("base64url");
    const tampered = `rl.v1.${forgedPayload}.${token.split(".")[3]}`;

    expect(verifyRatingToken(tampered, NOW_MS)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a payload edited to name a different user", () => {
    const signature = mint().split(".")[3];
    const forgedPayload = Buffer.from(
      [ITEM_ID, OTHER_USER_ID, "4", String(Math.floor(NOW_MS / 1000) + 60)].join(":"),
      "utf8",
    ).toString("base64url");

    expect(verifyRatingToken(`rl.v1.${forgedPayload}.${signature}`, NOW_MS)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a payload edited to bump the star value", () => {
    const [, , encoded, signature] = mint({ stars: 1 }).split(".");
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const bumped = Buffer.from(decoded.replace(":1:", ":5:"), "utf8").toString("base64url");

    expect(bumped).not.toBe(encoded);
    expect(verifyRatingToken(`rl.v1.${bumped}.${signature}`, NOW_MS)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a payload edited to push the expiry out", () => {
    const [, , encoded, signature] = mint().split(".");
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const fields = decoded.split(":");
    fields[3] = String(Number(fields[3]) + 86_400 * 365);
    const extended = Buffer.from(fields.join(":"), "utf8").toString("base64url");

    expect(verifyRatingToken(`rl.v1.${extended}.${signature}`, NOW_MS)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a mutated signature", () => {
    const [prefix, version, encoded, signature] = mint().split(".");
    const mutated = `${signature.slice(0, -2)}${signature.endsWith("zz") ? "aa" : "zz"}`;

    expect(verifyRatingToken([prefix, version, encoded, mutated].join("."), NOW_MS)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a truncated signature (length mismatch must not throw)", () => {
    const [prefix, version, encoded, signature] = mint().split(".");

    expect(() =>
      verifyRatingToken([prefix, version, encoded, signature.slice(0, 10)].join("."), NOW_MS),
    ).not.toThrow();
    expect(
      verifyRatingToken([prefix, version, encoded, signature.slice(0, 10)].join("."), NOW_MS),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a token signed with a different secret", () => {
    const token = forgeToken([ITEM_ID, USER_ID, 4, Math.floor(NOW_MS / 1000) + 60], OTHER_SECRET);

    expect(verifyRatingToken(token, NOW_MS)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a valid token once the verifying secret is rotated", () => {
    const token = mint();
    expect(verifyRatingToken(token, NOW_MS).ok).toBe(true);

    process.env.RATING_LINK_SECRET = OTHER_SECRET;
    expect(verifyRatingToken(token, NOW_MS)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a version downgrade even when the payload is otherwise intact", () => {
    const [, , encoded, signature] = mint().split(".");

    expect(verifyRatingToken(`rl.v0.${encoded}.${signature}`, NOW_MS)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});

describe("expiry", () => {
  it("rejects a token past its expiry", () => {
    const token = mint();
    const justAfter = NOW_MS + (RATING_LINK_TTL_SECONDS + 1) * 1000;

    expect(verifyRatingToken(token, justAfter)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token exactly at its expiry (boundary is closed)", () => {
    const expiresAtSeconds = Math.floor(NOW_MS / 1000) + 60;
    const token = mint({ expiresAtSeconds });

    expect(verifyRatingToken(token, expiresAtSeconds * 1000)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(verifyRatingToken(token, expiresAtSeconds * 1000 - 1).ok).toBe(true);
  });

  it("accepts a token a day before it expires", () => {
    const token = mint();
    const dayBefore = NOW_MS + (RATING_LINK_TTL_SECONDS - 86_400) * 1000;

    expect(verifyRatingToken(token, dayBefore).ok).toBe(true);
  });

  it("defaults to a 30-day window", () => {
    expect(RATING_LINK_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
  });
});

describe("malformed input", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["not a token", "hello"],
    ["too few segments", "rl.v1.abc"],
    ["too many segments", "rl.v1.abc.def.ghi"],
    ["wrong prefix", "xx.v1.abc.def"],
    ["non-base64url payload", "rl.v1.not base64!.abcdef"],
    ["non-base64url signature", "rl.v1.YWJj.not base64!"],
    ["empty payload segment", "rl.v1..abcdef"],
    ["empty signature segment", "rl.v1.YWJj."],
  ])("rejects %s", (_label, token) => {
    const result = verifyRatingToken(token as string | null | undefined, NOW_MS);
    expect(result).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects an absurdly long token before doing any HMAC work", () => {
    expect(verifyRatingToken(`rl.v1.${"A".repeat(5000)}.${"B".repeat(43)}`, NOW_MS)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it.each([
    ["too few fields", [ITEM_ID, USER_ID, 4]],
    ["too many fields", [ITEM_ID, USER_ID, 4, Math.floor(NOW_MS / 1000) + 60, "extra"]],
    ["non-uuid item id", ["not-a-uuid", USER_ID, 4, Math.floor(NOW_MS / 1000) + 60]],
    ["non-uuid user id", [ITEM_ID, "not-a-uuid", 4, Math.floor(NOW_MS / 1000) + 60]],
    ["non-numeric expiry", [ITEM_ID, USER_ID, 4, "soon"]],
    ["negative expiry", [ITEM_ID, USER_ID, 4, "-1"]],
  ])("rejects a correctly signed token with %s", (_label, fields) => {
    expect(verifyRatingToken(forgeToken(fields as (string | number)[]), NOW_MS)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});

describe("star range", () => {
  it.each([0, 6, 9])("rejects a correctly signed token carrying %i stars", (stars) => {
    const token = forgeToken([ITEM_ID, USER_ID, stars, Math.floor(NOW_MS / 1000) + 60]);

    expect(verifyRatingToken(token, NOW_MS)).toEqual({ ok: false, reason: "invalid_stars" });
  });

  it.each([-1, 1.5, "four"])("refuses to mint %s stars", (stars) => {
    expect(() => mint({ stars: stars as number })).toThrow(/stars/);
  });

  it("refuses to mint 0 or 6 stars", () => {
    expect(() => mint({ stars: 0 })).toThrow(/stars/);
    expect(() => mint({ stars: 6 })).toThrow(/stars/);
  });
});

describe("secret handling", () => {
  it("fails closed when the secret is missing", () => {
    const token = mint();
    delete process.env.RATING_LINK_SECRET;

    expect(verifyRatingToken(token, NOW_MS)).toEqual({ ok: false, reason: "missing_secret" });
  });

  it("fails closed when the secret is an empty string", () => {
    const token = mint();
    process.env.RATING_LINK_SECRET = "";

    expect(verifyRatingToken(token, NOW_MS)).toEqual({ ok: false, reason: "missing_secret" });
  });

  it("refuses to mint without a secret", () => {
    delete process.env.RATING_LINK_SECRET;

    expect(() => mint()).toThrow(/RATING_LINK_SECRET/);
  });

  it("reads the secret lazily, not at import time", () => {
    process.env.RATING_LINK_SECRET = OTHER_SECRET;
    const withOther = mint();

    process.env.RATING_LINK_SECRET = SECRET;
    expect(mint()).not.toBe(withOther);
  });
});

describe("mint input validation", () => {
  it("refuses non-uuid ids", () => {
    expect(() => mint({ itemId: "nope" })).toThrow(/itemId/);
    expect(() => mint({ userId: "nope" })).toThrow(/userId/);
  });

  it("refuses an id carrying the field separator", () => {
    expect(() => mint({ itemId: `${ITEM_ID}:${USER_ID}` })).toThrow(/itemId/);
  });

  it("refuses a non-integer expiry", () => {
    expect(() => mint({ expiresAtSeconds: 1.5 })).toThrow(/expiresAtSeconds/);
    expect(() => mint({ expiresAtSeconds: 0 })).toThrow(/expiresAtSeconds/);
  });
});

describe("ratingLinkUrl", () => {
  it("joins the app URL and token", () => {
    expect(ratingLinkUrl("https://theque.app", "rl.v1.abc.def")).toBe(
      "https://theque.app/rate/rl.v1.abc.def",
    );
  });

  it("tolerates a trailing slash on the app URL", () => {
    expect(ratingLinkUrl("https://theque.app/", "rl.v1.abc.def")).toBe(
      "https://theque.app/rate/rl.v1.abc.def",
    );
  });
});

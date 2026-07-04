import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptField, decryptItemFields, encryptField } from "@/lib/crypto/field-crypto";

const TEST_KEY = Buffer.alloc(32, 1).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 2).toString("base64");

beforeEach(() => {
  process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
});

describe("encryptField / decryptField roundtrip", () => {
  it.each([
    ["ascii", "re-read after the breakup"],
    ["unicode", "私は、この本を読んで泣いた 😭🍜 — plein de émotions"],
    ["long text", "lorem ipsum ".repeat(2000)],
    ["empty string", ""],
    ["single char", "x"],
  ])("roundtrips %s", (_label, value) => {
    const encrypted = encryptField(value);
    expect(encrypted.startsWith("enc.v1.")).toBe(true);
    expect(decryptField(encrypted)).toBe(value);
  });

  it("produces a different ciphertext each call (random IV)", () => {
    const a = encryptField("same input");
    const b = encryptField("same input");
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe("same input");
    expect(decryptField(b)).toBe("same input");
  });
});

describe("tamper detection", () => {
  it("throws when the ciphertext segment is mutated", () => {
    const encrypted = encryptField("secret verdict");
    const [prefix, version, iv, ciphertext, tag] = encrypted.split(".");
    const mutated = [prefix, version, iv, ciphertext.slice(0, -2) + "zz", tag].join(".");
    expect(() => decryptField(mutated)).toThrow();
  });

  it("throws when the tag segment is mutated", () => {
    const encrypted = encryptField("secret verdict");
    const [prefix, version, iv, ciphertext, tag] = encrypted.split(".");
    const mutated = [prefix, version, iv, ciphertext, tag.slice(0, -2) + "zz"].join(".");
    expect(() => decryptField(mutated)).toThrow();
  });

  it("throws when the iv segment is mutated", () => {
    const encrypted = encryptField("secret verdict");
    const [prefix, version, iv, ciphertext, tag] = encrypted.split(".");
    const mutated = [prefix, version, iv.slice(0, -2) + "zz", ciphertext, tag].join(".");
    expect(() => decryptField(mutated)).toThrow();
  });

  it("throws on a malformed enc.* value (wrong segment count)", () => {
    expect(() => decryptField("enc.v1.onlyoneseg")).toThrow();
  });

  it("throws on an unknown version tag", () => {
    const encrypted = encryptField("secret verdict");
    const [, version, iv, ciphertext, tag] = encrypted.split(".");
    void version;
    expect(() => decryptField(["enc", "v2", iv, ciphertext, tag].join("."))).toThrow();
  });
});

describe("legacy plaintext passthrough", () => {
  it("returns a value with no enc. prefix unchanged", () => {
    expect(decryptField("just a plain note, never encrypted")).toBe(
      "just a plain note, never encrypted",
    );
  });

  it("does not attempt to decrypt something that merely contains 'enc.' mid-string", () => {
    const value = "check out this enc.oder cable";
    expect(decryptField(value)).toBe(value);
  });
});

describe("null/empty handling", () => {
  it("passes null through unchanged", () => {
    expect(decryptField(null)).toBeNull();
  });

  it("passes empty string through unchanged", () => {
    expect(decryptField("")).toBe("");
  });
});

describe("missing/invalid key behavior", () => {
  it("encryptField throws when FIELD_ENCRYPTION_KEY is unset", () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(() => encryptField("hello")).toThrow();
  });

  it("decryptField throws on an enc.* value when the key is unset", () => {
    const encrypted = encryptField("hello");
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(() => decryptField(encrypted)).toThrow();
  });

  it("decryptField throws on an enc.* value when the key is invalid base64 length", () => {
    const encrypted = encryptField("hello");
    process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(16, 3).toString("base64");
    expect(() => decryptField(encrypted)).toThrow();
  });

  it("decryptField throws (auth tag mismatch) when decrypting with the wrong key", () => {
    const encrypted = encryptField("hello");
    process.env.FIELD_ENCRYPTION_KEY = OTHER_KEY;
    expect(() => decryptField(encrypted)).toThrow();
  });

  it("never returns plaintext-looking output when the key is missing", () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(() => decryptField("enc.v1.aaaa.bbbb.cccc")).toThrow();
  });
});

describe("decryptItemFields", () => {
  it("decrypts note and verdict, leaves other fields untouched", () => {
    const note = encryptField("my private note");
    const verdict = encryptField("re-read after the breakup");
    const row = {
      id: "item-1",
      title: "Some Title",
      note,
      verdict,
      status: "done" as const,
    };
    const result = decryptItemFields(row);
    expect(result.note).toBe("my private note");
    expect(result.verdict).toBe("re-read after the breakup");
    expect(result.id).toBe("item-1");
    expect(result.title).toBe("Some Title");
    expect(result.status).toBe("done");
  });

  it("is safe when note/verdict are null", () => {
    const row = { id: "item-2", note: null, verdict: null };
    const result = decryptItemFields(row);
    expect(result.note).toBeNull();
    expect(result.verdict).toBeNull();
  });

  it("is safe when note/verdict are absent from the row shape", () => {
    // Narrower selects (e.g. LIBRARY_ITEM_COLUMNS without `note`) omit the key
    // entirely rather than setting it to null — annotate the literal so the
    // type carries the (unset) optional keys, matching that real shape.
    const row: { id: string; title: string; note?: string | null; verdict?: string | null } = {
      id: "item-3",
      title: "No note or verdict field at all",
    };
    const result = decryptItemFields(row);
    expect(result).toEqual(row);
  });

  it("dual-reads a legacy plaintext note alongside an encrypted verdict", () => {
    const row = {
      id: "item-4",
      note: "legacy plaintext note",
      verdict: encryptField("encrypted verdict"),
    };
    const result = decryptItemFields(row);
    expect(result.note).toBe("legacy plaintext note");
    expect(result.verdict).toBe("encrypted verdict");
  });

  it("does not mutate the original row (shallow copy)", () => {
    const row = { id: "item-5", note: encryptField("hi"), verdict: null };
    const result = decryptItemFields(row);
    expect(result).not.toBe(row);
    expect(row.note?.startsWith("enc.v1.")).toBe(true);
  });
});

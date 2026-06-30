import { describe, expect, it } from "vitest";

import {
  BINDINGS,
  BINDING_STORAGE_KEY,
  DEFAULT_BINDING,
  isBinding,
  normalizeBinding,
} from "./binding";

describe("binding", () => {
  it("defaults to amber", () => {
    expect(DEFAULT_BINDING).toBe("amber");
    expect(BINDINGS[0].id).toBe("amber");
  });

  it("exposes a stable storage key", () => {
    expect(BINDING_STORAGE_KEY).toBe("theque-binding");
  });

  it("has unique ids and a swatch per binding", () => {
    const ids = BINDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BINDINGS) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("recognizes every defined binding id", () => {
    for (const b of BINDINGS) {
      expect(isBinding(b.id)).toBe(true);
    }
  });

  it("rejects unknown / malformed values", () => {
    for (const bad of ["", "Amber", "blue", "AMBER", 0, null, undefined, {}, []]) {
      expect(isBinding(bad)).toBe(false);
    }
  });

  it("normalizes valid values through unchanged", () => {
    expect(normalizeBinding("leather")).toBe("leather");
    expect(normalizeBinding("plum")).toBe("plum");
  });

  it("normalizes invalid values to the default", () => {
    for (const bad of ["", "nonsense", null, undefined, 42, {}]) {
      expect(normalizeBinding(bad)).toBe(DEFAULT_BINDING);
    }
  });
});

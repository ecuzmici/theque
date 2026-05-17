import { describe, expect, it } from "vitest";

import {
  captureCategoryHintFromStructured,
  parseCaptureCategoryHint,
} from "@/lib/capture/category-hint";

describe("parseCaptureCategoryHint", () => {
  it("returns null when the hint is omitted or Auto is represented as an empty value", () => {
    expect(parseCaptureCategoryHint(undefined)).toBeNull();
    expect(parseCaptureCategoryHint(null)).toBeNull();
    expect(parseCaptureCategoryHint("")).toBeNull();
  });

  it("accepts item categories used by the extension shelf labels", () => {
    expect(parseCaptureCategoryHint("books")).toBe("books");
    expect(parseCaptureCategoryHint("movies_and_tv")).toBe("movies_and_tv");
    expect(parseCaptureCategoryHint("restaurants")).toBe("restaurants");
    expect(parseCaptureCategoryHint("products")).toBe("products");
    expect(parseCaptureCategoryHint("travel")).toBe("travel");
    expect(parseCaptureCategoryHint("articles")).toBe("articles");
    expect(parseCaptureCategoryHint("recipes")).toBe("recipes");
  });

  it("rejects values that are not extension category hints", () => {
    expect(parseCaptureCategoryHint("gifts")).toBe("invalid");
    expect(parseCaptureCategoryHint("music")).toBe("invalid");
    expect(parseCaptureCategoryHint(["books"])).toBe("invalid");
  });
});

describe("captureCategoryHintFromStructured", () => {
  it("reads a stored capture category hint", () => {
    expect(captureCategoryHintFromStructured({ capture_category_hint: "movies_and_tv" })).toBe(
      "movies_and_tv",
    );
  });

  it("returns null when structured data has no valid stored hint", () => {
    expect(captureCategoryHintFromStructured({})).toBeNull();
    expect(captureCategoryHintFromStructured({ capture_category_hint: "gifts" })).toBeNull();
    expect(captureCategoryHintFromStructured(null)).toBeNull();
  });
});

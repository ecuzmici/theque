import { describe, expect, it } from "vitest";

import { formatEnrichmentError } from "./item-labels";

describe("formatEnrichmentError", () => {
  it("explains a blocked page", () => {
    expect(formatEnrichmentError("fetch_blocked_or_sparse")).toMatch(/blocked our preview/);
  });

  it("hides a stale or raw error behind one sentence", () => {
    expect(formatEnrichmentError("stale_processing")).toBe("We could not fetch details for this page.");
    expect(formatEnrichmentError("getaddrinfo EBUSY example.com")).toBe(
      "We could not fetch details for this page.",
    );
  });
});

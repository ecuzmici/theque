import { describe, expect, it } from "vitest";

import { buildAiReviewRows } from "@/lib/items/ai-review";

describe("buildAiReviewRows", () => {
  it("marks changed metadata rows for review", () => {
    const rows = buildAiReviewRows(
      {
        title: "Old title",
        subtitle: null,
        description: null,
        image_url: null,
        category: "articles",
        category_confidence: 0.4,
        structured: {},
      },
      {
        title: "A Drop of Corruption",
        subtitle: null,
        description: null,
        image_url: null,
        category: "books",
        category_confidence: 0.93,
        structured: {
          authors: ["Robert Jackson Bennett"],
        },
        confidence: 0.88,
        sources: ["url"],
        notes: null,
      },
    );

    expect(rows.filter((row) => row.changed).map((row) => row.key)).toEqual([
      "title",
      "category",
      "category_confidence",
      "structured",
    ]);
  });
});

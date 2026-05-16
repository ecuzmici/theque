import { describe, expect, it } from "vitest";

import { applyItemRewriteProposal } from "@/lib/enrichment/llm/apply-item-rewrite-proposal";

describe("applyItemRewriteProposal", () => {
  it("applies the accepted proposal and records audit metadata", () => {
    const result = applyItemRewriteProposal({
      current: {
        title: "Old title",
        subtitle: null,
        description: "Old description",
        image_url: null,
        category: "articles",
        category_confidence: 0.4,
        category_source: "heuristic",
        structured: { author: "Unknown" },
        rawMetadata: { parser: "generic" },
      },
      proposal: {
        category: "books",
        category_confidence: 0.93,
        title: "A Drop of Corruption",
        subtitle: null,
        description: "A detective fantasy sequel.",
        image_url: "https://example.com/book.jpg",
        structured: {
          authors: ["Robert Jackson Bennett"],
        },
        confidence: 0.88,
        sources: ["url"],
        notes: "Amazon Kindle listing",
      },
      providerMetadata: {
        provider: "gemini",
        model: "gemini-2.5-flash",
      },
      now: "2026-05-16T00:00:00.000Z",
    });

    expect(result).toMatchObject({
      title: "A Drop of Corruption",
      description: "A detective fantasy sequel.",
      image_url: "https://example.com/book.jpg",
      category: "books",
      category_confidence: 0.93,
      category_source: "llm",
      structured: {
        authors: ["Robert Jackson Bennett"],
      },
    });
    expect(result.rawMetadata.ai_review).toMatchObject({
      provider: "gemini",
      model: "gemini-2.5-flash",
      status: "accepted",
      accepted_fields: [
        "category",
        "category_confidence",
        "category_source",
        "title",
        "description",
        "image_url",
        "structured",
      ],
      proposal: {
        category: "books",
        category_confidence: 0.93,
      },
    });
  });
});

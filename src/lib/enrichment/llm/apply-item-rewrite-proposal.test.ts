import { describe, expect, it } from "vitest";

import {
  applyItemRewriteProposal,
  mergeProposedStructured,
} from "@/lib/enrichment/llm/apply-item-rewrite-proposal";

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
        subtitle: undefined,
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

  it("preserves existing structured fields when the proposal is empty and category is unchanged", () => {
    const result = applyItemRewriteProposal({
      current: {
        title: "The Gone World",
        subtitle: null,
        description: "Old description",
        image_url: null,
        category: "books",
        category_confidence: 0.95,
        category_source: "heuristic",
        structured: {
          isbn: "9780399167508",
          authors: ["Tom Sweterlitsch"],
          site_name: "Goodreads",
          page_count: 400,
          ratings_count: 31318,
          average_rating: 3.91,
        },
        rawMetadata: { parser: "goodreads" },
      },
      proposal: {
        category: "books",
        category_confidence: 1,
        title: "The Gone World",
        description: "A sharper description.",
        structured: {},
        confidence: 1,
        sources: ["https://www.goodreads.com/en/book/show/33413556-the-gone-world"],
      },
      providerMetadata: { provider: "gemini", model: "gemini-2.5-flash" },
      now: "2026-06-09T00:00:00.000Z",
    });

    expect(result.structured).toEqual({
      isbn: "9780399167508",
      authors: ["Tom Sweterlitsch"],
      site_name: "Goodreads",
      page_count: 400,
      ratings_count: 31318,
      average_rating: 3.91,
    });
    expect(result.rawMetadata.ai_review).toMatchObject({
      accepted_fields: ["category_confidence", "category_source", "description"],
    });
  });

  it("merges proposed structured over existing fields when the category is unchanged", () => {
    const result = applyItemRewriteProposal({
      current: {
        title: "The Gone World",
        subtitle: null,
        description: null,
        image_url: null,
        category: "books",
        category_confidence: 0.95,
        category_source: "heuristic",
        structured: { isbn: "9780399167508", authors: ["Tom Sweterlitsch"] },
        rawMetadata: {},
      },
      proposal: {
        category: "books",
        category_confidence: 0.97,
        structured: { page_count: 400 },
        confidence: 0.9,
        sources: ["url"],
      },
      providerMetadata: { provider: "gemini" },
      now: "2026-06-09T00:00:00.000Z",
    });

    expect(result.structured).toEqual({
      isbn: "9780399167508",
      authors: ["Tom Sweterlitsch"],
      page_count: 400,
    });
  });
});

describe("mergeProposedStructured", () => {
  it("replaces structured when the category changes", () => {
    expect(
      mergeProposedStructured({ author: "Unknown" }, { authors: ["Real Author"] }, true),
    ).toEqual({ authors: ["Real Author"] });
  });

  it("keeps existing fields when category is unchanged and proposal is empty", () => {
    expect(mergeProposedStructured({ isbn: "123" }, {}, false)).toEqual({ isbn: "123" });
    expect(mergeProposedStructured({ isbn: "123" }, undefined, false)).toEqual({ isbn: "123" });
  });
});

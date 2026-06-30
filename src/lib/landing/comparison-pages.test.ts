import { describe, expect, it } from "vitest";

import {
  buildMetadata,
  COMPARISON_PAGES,
  SITE_ORIGIN,
  type ComparisonPageConfig,
} from "./comparison-pages";

describe("comparison landing pages", () => {
  it("registers three pages with unique, lowercase, hyphenated slugs", () => {
    expect(COMPARISON_PAGES).toHaveLength(3);
    const slugs = COMPARISON_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("gives every page complete, non-empty content", () => {
    for (const page of COMPARISON_PAGES) {
      expect(page.headline.length).toBeGreaterThan(0);
      expect(page.intro.length).toBeGreaterThan(0);
      expect(page.competitorName.length).toBeGreaterThan(0);
      expect(page.comparison.length).toBeGreaterThan(0);
      expect(page.points).toHaveLength(3);
      expect(page.faq.length).toBeGreaterThan(0);
      // metadata description should be a reasonable length for search snippets
      expect(page.metaDescription.length).toBeGreaterThanOrEqual(50);
      expect(page.metaDescription.length).toBeLessThanOrEqual(320);
    }
  });

  it("builds a canonical and absolute OpenGraph url from the slug", () => {
    const page = COMPARISON_PAGES[0];
    const meta = buildMetadata(page);
    expect(meta.alternates?.canonical).toBe(`/${page.slug}`);
    expect(meta.openGraph).toMatchObject({
      url: `${SITE_ORIGIN}/${page.slug}`,
      type: "website",
    });
    expect(meta.title).toBe(page.metaTitle);
    expect(meta.description).toBe(page.metaDescription);
  });

  it("falls back to meta title/description when og overrides are absent", () => {
    const minimal: ComparisonPageConfig = {
      slug: "example-alternative",
      eyebrow: "Example",
      headline: "Headline",
      intro: "Intro",
      competitorName: "Example",
      comparisonHeading: "thèque vs. Example",
      comparison: [{ feature: "f", them: "t", us: "u" }],
      points: [
        { title: "a", detail: "a" },
        { title: "b", detail: "b" },
        { title: "c", detail: "c" },
      ],
      faq: [{ q: "q", a: "a" }],
      finalCtaHeading: "cta",
      metaTitle: "Meta Title",
      metaDescription: "Meta Description",
    };
    const meta = buildMetadata(minimal);
    expect(meta.openGraph?.title).toBe("Meta Title");
    expect(meta.openGraph).toMatchObject({ description: "Meta Description" });
  });
});

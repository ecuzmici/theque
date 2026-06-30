import type { MetadataRoute } from "next";

import { COMPARISON_PAGES } from "@/lib/landing/comparison-pages";

const BASE_URL = "https://theque.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const comparisonEntries: MetadataRoute.Sitemap = COMPARISON_PAGES.map((page) => ({
    url: `${BASE_URL}/${page.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [
    { url: BASE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    {
      url: `${BASE_URL}/pocket-alternative`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...comparisonEntries,
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}

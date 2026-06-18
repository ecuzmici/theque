import type { MetadataRoute } from "next";

const BASE_URL = "https://theque.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep authenticated app surfaces, the API, and internal/preview pages out of the index.
      disallow: [
        "/api/",
        "/auth/",
        "/library",
        "/settings",
        "/item/",
        "/collections",
        "/search",
        "/add",
        "/tags",
        "/share/",
        "/font-preview",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}

import type { ExtensionCategoryHint } from "@/lib/capture/category-hint";
import type { CategorySource, ItemCategory } from "@/lib/database.types";
import { flattenJsonLd, typesOf } from "@/lib/jsonld";

import { classifyFromDomain } from "@/lib/classify/domain-map";

export type Classification = {
  category: ItemCategory | null;
  category_confidence: number;
  category_source: CategorySource;
};

function pathHeuristic(pathname: string): Pick<Classification, "category" | "category_confidence"> | null {
  const p = pathname.toLowerCase();
  if (p.includes("/recipe") || p.includes("/recipes/")) {
    return { category: "recipes", category_confidence: 0.7 };
  }
  if (p.includes("/travel") || p.includes("/hotel") || p.includes("/flight")) {
    return { category: "travel", category_confidence: 0.65 };
  }
  return null;
}

function classifyFromJsonLd(jsonLdRoots: unknown[]): Pick<
  Classification,
  "category" | "category_confidence"
> | null {
  const nodes = jsonLdRoots.flatMap(flattenJsonLd);

  const schemaRank: Array<{ match: (types: string[]) => boolean; category: ItemCategory }> = [
    {
      match: (types) => types.some((t) => t === "Movie" || t === "TVSeries" || t === "TVEpisode"),
      category: "movies_and_tv",
    },
    {
      match: (types) =>
        types.some((t) => t === "MusicRecording" || t === "MusicAlbum" || t === "MusicGroup" || t === "Podcast"),
      category: "music",
    },
    { match: (types) => types.includes("Book"), category: "books" },
    { match: (types) => types.includes("Recipe"), category: "recipes" },
    {
      match: (types) =>
        types.some((t) => t === "Restaurant" || t === "FoodEstablishment" || t === "LocalBusiness"),
      category: "restaurants",
    },
    { match: (types) => types.includes("SoftwareApplication"), category: "apps" },
    { match: (types) => types.includes("Product"), category: "products" },
    {
      match: (types) =>
        types.some((t) => t === "Article" || t === "NewsArticle" || t === "BlogPosting"),
      category: "articles",
    },
  ];

  for (const node of nodes) {
    const t = typesOf(node);
    for (const { match, category } of schemaRank) {
      if (match(t)) {
        return { category, category_confidence: 0.85 };
      }
    }
  }

  return null;
}

export function classify(input: {
  domain: string;
  pathname: string;
  jsonLd: unknown[];
  categoryHint?: ExtensionCategoryHint | null;
}): Classification {
  // 1. Authoritative domain (strong signal — wins over schema.org)
  const domainHit = classifyFromDomain(input.domain);
  if (domainHit?.tier === "authoritative") {
    return {
      category: domainHit.category,
      category_confidence: domainHit.category_confidence,
      category_source: "domain",
    };
  }

  // 2. schema.org structured data
  const schemaHit = classifyFromJsonLd(input.jsonLd);
  if (schemaHit) {
    return {
      category: schemaHit.category,
      category_confidence: schemaHit.category_confidence,
      category_source: "schema_org",
    };
  }

  // 3. Ambiguous domain (after schema.org so page data can override)
  if (domainHit?.tier === "ambiguous") {
    return {
      category: domainHit.category,
      category_confidence: domainHit.category_confidence,
      category_source: "domain",
    };
  }

  // 4. Capture hint from extension
  if (input.categoryHint) {
    return {
      category: input.categoryHint,
      category_confidence: 0.6,
      category_source: "heuristic",
    };
  }

  // 5. Path heuristic
  const pathHit = pathHeuristic(input.pathname);
  if (pathHit) {
    return {
      category: pathHit.category,
      category_confidence: pathHit.category_confidence,
      category_source: "heuristic",
    };
  }

  // 6. Unknown — land in Inbox for triage
  return {
    category: null,
    category_confidence: 0.3,
    category_source: "heuristic",
  };
}

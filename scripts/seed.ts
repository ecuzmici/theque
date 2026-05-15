import { randomUUID, createHash } from "node:crypto";

import { loadEnvConfig } from "@next/env";

import type { ItemCategory } from "../src/lib/database.types";
import { createAdminClient } from "../src/lib/supabase/admin";

loadEnvConfig(process.cwd());

function fingerprint(url: string) {
  return createHash("sha256").update(url).digest("hex");
}

type SampleRow = {
  url: string;
  canonical_url: string;
  domain: string;
  title: string;
  subtitle: string | null;
  category: ItemCategory | null;
  status: "inbox" | "want" | "planned" | "done" | "dismissed";
  image_url?: string | null;
};

async function seed() {
  const userId = process.env.SEED_USER_ID?.trim();
  if (!userId) {
    throw new Error("SEED_USER_ID is required (your auth.users UUID from Supabase).");
  }

  const samples: SampleRow[] = [
    {
      url: "https://example.com/seed/film-one",
      canonical_url: "https://example.com/seed/film-one",
      domain: "example.com",
      title: "Sample film",
      subtitle: "2021 · drama",
      category: "movies_and_tv",
      image_url: null,
      status: "want",
    },
    {
      url: "https://example.com/seed/book-one",
      canonical_url: "https://example.com/seed/book-one",
      domain: "example.com",
      title: "Sample book",
      subtitle: "Author Name",
      category: "books",
      status: "inbox",
    },
    {
      url: "https://example.com/seed/article-one",
      canonical_url: "https://example.com/seed/article-one",
      domain: "example.com",
      title: "Sample article",
      subtitle: null,
      category: "articles",
      status: "want",
    },
  ];

  const admin = createAdminClient();

  for (const s of samples) {
    const url_fingerprint = fingerprint(s.canonical_url);

    const { error } = await admin.from("items").insert({
      id: randomUUID(),
      user_id: userId,
      url: s.url,
      canonical_url: s.canonical_url,
      url_fingerprint,
      domain: s.domain,
      title: s.title,
      subtitle: s.subtitle,
      category: s.category ?? null,
      status: s.status,
      source: "manual",
      processing_status: "ready",
      enrichment_attempts: 0,
      image_url: s.image_url ?? null,
      structured: {},
      raw_metadata: {},
      display: {},
    });

    if (error && error.code !== "23505") {
      throw error;
    }
  }

  console.log(`Seeded up to ${samples.length} demo items for user ${userId}.`);
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

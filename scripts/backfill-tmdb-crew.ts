/**
 * Surgical TMDB crew backfill (ADR 0011, issue #42).
 *
 * Corrects movies_and_tv items already in the library that carry a wrong,
 * memory-sourced director. For each item it resolves TMDB by stored title+year
 * (with credits) and OVERWRITES directors/runtime/genres/rating with TMDB's
 * values; on a TMDB miss it clears a model_knowledge director (blank beats
 * wrong). No page re-fetch, no LLM. Prior values are printed for audit.
 *
 * Usage:
 *   npm run backfill:crew              # dry-run (default): writes NOTHING
 *   npm run backfill:crew -- --apply   # actually persist the corrections
 *   npm run backfill:crew -- --limit=50
 *
 * (The npm script passes --conditions=react-server so the "server-only" guard
 * in resolveMovieWithTmdb / the admin client resolves to its no-op build.)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + TMDB_API_KEY
 * in env (or .env.local).
 */

import { loadEnvConfig } from "@next/env";

import type { Json } from "../src/lib/database.types";
import { computeCrewBackfill } from "../src/lib/enrichment/crew-backfill";
import { isErrorPageTitle } from "../src/lib/enrichment/meta-utils";
import { extractImdbTitleId } from "../src/lib/enrichment/url-hints";
import { resolveMovieWithTmdb } from "../src/lib/recommend/resolve/tmdb";
import { createAdminClient } from "../src/lib/supabase/admin";

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : 500;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function fieldSourcesOf(rawMetadata: unknown): Record<string, string> {
  const llm = asRecord(asRecord(rawMetadata).llm);
  const fs = asRecord(llm.field_sources);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fs)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

async function run() {
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("items")
    .select("id, title, structured, raw_metadata, canonical_url")
    .eq("category", "movies_and_tv")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch items:", error.message);
    process.exit(1);
  }

  console.log(
    `Scanning ${(rows ?? []).length} movies_and_tv items${apply ? " (APPLY)" : " (dry-run — no writes)"}\n`,
  );

  let changedCount = 0;
  let written = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const title = row.title?.trim();
    if (!title) continue;
    if (isErrorPageTitle(title)) {
      console.log(`• ${title} (${row.id})\n    skip (error/bot-wall title)`);
      continue;
    }

    const structured = asRecord(row.structured);
    const year = typeof structured.year === "number" ? structured.year : null;
    const fieldSources = fieldSourcesOf(row.raw_metadata);
    const imdbId = extractImdbTitleId(row.canonical_url ?? "");

    let tmdb = null;
    try {
      tmdb = await resolveMovieWithTmdb({ title, creator: "", year }, { includeCredits: true, imdbId });
    } catch (err) {
      console.warn(`  TMDB lookup failed for ${row.id} (${title}):`, err instanceof Error ? err.message : err);
    }

    const { nextStructured, changed, log } = computeCrewBackfill({ structured, fieldSources, tmdb });
    if (!changed) continue;

    changedCount++;
    console.log(`• ${title} (${row.id})`);
    for (const [field, { prior, next }] of Object.entries(log)) {
      console.log(`    ${field}: ${JSON.stringify(prior)} → ${JSON.stringify(next)}`);
    }

    if (apply) {
      const { error: updateErr } = await admin
        .from("items")
        .update({ structured: nextStructured as Json })
        .eq("id", row.id);
      if (updateErr) {
        console.warn(`    ! write failed: ${updateErr.message}`);
        failed++;
      } else {
        written++;
      }
    }
  }

  console.log(
    `\nDone. changed=${changedCount}${apply ? `, written=${written}, failed=${failed}` : " (dry-run — rerun with --apply to persist)"}`,
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

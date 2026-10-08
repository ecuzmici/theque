/**
 * Recommendation YIELD / STARVATION eval (ADR 0016).
 *
 * The old bench (scripts/bench-recommend.ts) is a per-call model shootout on a
 * frozen fixture — it measures resolve-rate and novelty but never reproduces the
 * failure that actually breaks the feature: the funnel collapsing to zero
 * survivors as the never-list grows. This eval reproduces exactly that.
 *
 * It imports the REAL pipeline (no replica): buildTasteProfile,
 * buildRecommendPrompt, the real Open Library / TMDB resolvers,
 * dedupRecommendations, filterNeverTitles, isSuppressedOutcome, and the real
 * gateway helper. Only the DB fetch is eval-specific. A green eval therefore
 * means green production.
 *
 * For each shelf it runs K sequential rounds against your real library +
 * outcome history; each round appends its picks to the never-list (simulating
 * the `shown` rows the route would insert), so the run finds
 * rounds-until-starvation — the metric that decides whether a config or model
 * survives heavy use.
 *
 * Run (server-only modules resolve to no-ops under the react-server condition,
 * the same trick the backfill scripts use):
 *
 *   npx tsx --conditions=react-server --env-file=.env.local \
 *     scripts/eval-recommend.ts --email you@example.com [--rounds 8] \
 *     [--shelf books|watch|both] [--model google/gemini-3.1-flash-lite] [--dry-run]
 *
 * Requires: AI_GATEWAY_API_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 * (+ TMDB_API_KEY for the watch shelf) in the environment / .env.local.
 */

import { generateJsonWithFallback } from "../src/lib/ai/gateway";
import { decryptItemFields } from "../src/lib/crypto/field-crypto";
import { dedupRecommendations, normalizeTitle } from "../src/lib/recommend/dedup";
import {
  RECOMMEND_COUNT,
  RECOMMEND_MIN_ITEMS,
  RECOMMEND_MODELS,
  RECOMMEND_OVER_REQUEST,
  RECOMMEND_PROVIDER_OPTIONS,
  RECOMMEND_SHOWN_COOLDOWN_DAYS,
  RECOMMEND_TEMPERATURE,
  RECOMMEND_TIMEOUT_MS,
} from "../src/lib/recommend/recommend-config";
import {
  RECOMMEND_RESPONSE_SCHEMA,
  buildRecommendPrompt,
  parseLlmCandidates,
} from "../src/lib/recommend/recommend-prompt";
import { resolveBooks } from "../src/lib/recommend/resolve/books";
import { resolveMovieWithTmdb } from "../src/lib/recommend/resolve/tmdb";
import { isSuppressedOutcome } from "../src/lib/recommend/suppression";
import {
  buildTasteProfile,
  categoriesForShelf,
  filterNeverTitles,
  outcomeCategoryForShelf,
  type LibraryItemRow,
  type OutcomeRow,
} from "../src/lib/recommend/taste-profile";
import type { RecommendShelfId } from "../src/lib/recommend/recommend-types";
import { createAdminClient } from "../src/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// ---- Args -------------------------------------------------------------------

type Args = {
  email: string | null;
  userId: string | null;
  rounds: number;
  shelves: RecommendShelfId[];
  model: string | null;
  dryRun: boolean;
  recency: boolean;
};

/**
 * Optional prompt nudge (ADR 0016 follow-up): the recommend path has no search
 * grounding, so recent-knowledge models still default to safe canon unless the
 * prompt explicitly asks for freshness. Appended to the real prompt only when
 * --recency is passed, so it measures the effect without changing production.
 */
const RECENCY_NUDGE =
  "\n\nRECENCY (important): strongly favor titles released in the last ~2 years " +
  "(2024–2026) that you are confident actually exist. Do NOT recommend sequels or " +
  "later entries in a series the user has already listed. Prioritize fresh discoveries " +
  "over safe canonical picks, while staying true to their taste.";

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : null;
  };
  const shelfArg = (get("--shelf") ?? "both").toLowerCase();
  const shelves: RecommendShelfId[] =
    shelfArg === "books" ? ["books"] : shelfArg === "watch" ? ["watch"] : ["books", "watch"];
  return {
    email: get("--email"),
    userId: get("--user"),
    rounds: Number.parseInt(get("--rounds") ?? "8", 10),
    shelves,
    model: get("--model"),
    dryRun: argv.includes("--dry-run"),
    recency: argv.includes("--recency"),
  };
}

// ---- Supabase ---------------------------------------------------------------

/** Resolve a user id from an email via the admin API (paginated). */
async function resolveUserId(sb: AdminClient, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

type RawItem = {
  title: string | null;
  status: string;
  rating_personal: number | null;
  verdict: string | null;
  structured: unknown;
  category: LibraryItemRow["category"];
};

async function fetchLibrary(
  sb: AdminClient,
  userId: string,
  categories: LibraryItemRow["category"][],
): Promise<LibraryItemRow[]> {
  const { data, error } = await sb
    .from("items")
    .select("title, status, rating_personal, verdict, structured, category")
    .eq("user_id", userId)
    .in("category", categories);
  if (error) throw new Error(`items query failed: ${error.message}`);
  // Decrypt verdict/note like the route does; best-effort so a missing
  // FIELD_ENCRYPTION_KEY doesn't sink the title-driven yield metric.
  return ((data ?? []) as RawItem[]).map((row) => {
    try {
      return decryptItemFields(row as LibraryItemRow);
    } catch {
      return { ...(row as LibraryItemRow), verdict: null };
    }
  });
}

async function fetchOutcomes(
  sb: AdminClient,
  userId: string,
  category: "books" | "movies_and_tv",
): Promise<OutcomeRow[]> {
  const { data, error } = await sb
    .from("recommendation_outcomes")
    .select("title_norm, outcome, shown_at")
    .eq("user_id", userId)
    .eq("category", category);
  if (error) throw new Error(`outcomes query failed: ${error.message}`);
  return (data ?? []) as OutcomeRow[];
}

// ---- One round (mirrors route.ts, minus the DB writes) ----------------------

type Pick = { title: string; creator: string | null; year: number | null };

type RoundResult = {
  round: number;
  llmReturned: number;
  resolved: number;
  afterDedup: number;
  afterNever: number;
  final: number;
  reason: "ok" | "exhausted" | "transient";
  picks: Pick[];
};


async function runRound(
  round: number,
  shelfId: RecommendShelfId,
  items: LibraryItemRow[],
  baseOutcomes: OutcomeRow[],
  sessionShown: Set<string>, // title_norm accumulated across prior rounds
  models: string[],
  recency: boolean,
): Promise<RoundResult> {
  const cutoffMs = Date.now() - RECOMMEND_SHOWN_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const suppressed = baseOutcomes
    .filter((r) => isSuppressedOutcome(r, cutoffMs))
    .map((r) => r.title_norm);
  const suppressedTitles = [...suppressed, ...sessionShown];

  const tasteProfile = buildTasteProfile(items, suppressedTitles);
  const existingTitles = items
    .map((i) => i.title)
    .filter((t): t is string => Boolean(t && t.trim()));

  const prompt = buildRecommendPrompt(shelfId, tasteProfile) + (recency ? RECENCY_NUDGE : "");
  const { data } = await generateJsonWithFallback<{ candidates?: unknown[] }>({
    models,
    prompt,
    schema: RECOMMEND_RESPONSE_SCHEMA,
    temperature: RECOMMEND_TEMPERATURE,
    timeoutMs: RECOMMEND_TIMEOUT_MS,
    providerOptions: RECOMMEND_PROVIDER_OPTIONS,
    label: "eval-recommend",
  });

  const candidates = parseLlmCandidates(data) ?? [];
  const isWatch = shelfId === "watch";
  const overRequested = candidates.slice(0, RECOMMEND_OVER_REQUEST);

  const books = isWatch ? [] : await resolveBooks(overRequested);
  const settled = await Promise.allSettled(
    overRequested.map(async (candidate, index): Promise<Pick | null> => {
      const resolved = isWatch ? await resolveMovieWithTmdb(candidate) : books[index];
      return resolved
        ? { title: candidate.title, creator: candidate.creator ?? null, year: candidate.year ?? null }
        : null;
    }),
  );
  const resolvedCards = settled
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((c): c is Pick => c !== null);

  // dedup + never-filter only read `.title`, so Pick objects pass through.
  const deduped = dedupRecommendations(resolvedCards as never, existingTitles) as unknown as Pick[];
  const filtered = filterNeverTitles(deduped, tasteProfile.never);
  const final = filtered.slice(0, RECOMMEND_COUNT);

  const reason: RoundResult["reason"] =
    final.length >= RECOMMEND_COUNT
      ? "ok"
      : candidates.length >= RECOMMEND_COUNT && resolvedCards.length > 0
        ? "exhausted"
        : "transient";

  return {
    round,
    llmReturned: candidates.length,
    resolved: resolvedCards.length,
    afterDedup: deduped.length,
    afterNever: filtered.length,
    final: final.length,
    reason,
    picks: final,
  };
}

// ---- Per-shelf simulation ---------------------------------------------------

async function evalShelf(
  sb: AdminClient,
  userId: string,
  shelfId: RecommendShelfId,
  rounds: number,
  models: string[],
  dryRun: boolean,
  recency: boolean,
): Promise<void> {
  const categories = categoriesForShelf(shelfId);
  const outcomeCategory = outcomeCategoryForShelf(shelfId);
  const items = await fetchLibrary(sb, userId, categories);
  const outcomes = await fetchOutcomes(sb, userId, outcomeCategory);

  const titled = items.filter((i) => i.title?.trim());
  const cutoffMs = Date.now() - RECOMMEND_SHOWN_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const suppressedNow = outcomes.filter((r) => isSuppressedOutcome(r, cutoffMs)).length;

  console.log(`\n================ SHELF: ${shelfId.toUpperCase()} ================`);
  console.log(
    `library=${titled.length} titled · outcomes=${outcomes.length} ` +
      `(suppressed-now=${suppressedNow}) · over_request=${RECOMMEND_OVER_REQUEST} · ` +
      `target=${RECOMMEND_COUNT}/round · cooldown=${RECOMMEND_SHOWN_COOLDOWN_DAYS}d`,
  );
  console.log(`models: ${models.join(" → ")}`);

  if (titled.length < RECOMMEND_MIN_ITEMS) {
    console.log(`SKIP: fewer than RECOMMEND_MIN_ITEMS (${RECOMMEND_MIN_ITEMS}) titled items.`);
    return;
  }

  if (dryRun) {
    const prompt = buildRecommendPrompt(
      shelfId,
      buildTasteProfile(
        items,
        outcomes.filter((r) => isSuppressedOutcome(r, cutoffMs)).map((r) => r.title_norm),
      ),
    );
    console.log(`\n--- PROMPT (round 1, ${prompt.length} chars) ---\n${prompt}`);
    return;
  }

  const sessionShown = new Set<string>();
  const results: RoundResult[] = [];
  let firstUnderfill: number | null = null;
  let firstStarve: number | null = null;

  for (let r = 1; r <= rounds; r++) {
    process.stdout.write(`  round ${r}/${rounds} ... `);
    let res: RoundResult;
    try {
      res = await runRound(r, shelfId, items, outcomes, sessionShown, models, recency);
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
    results.push(res);
    console.log(
      `llm=${res.llmReturned} resolved=${res.resolved} dedup=${res.afterDedup} ` +
        `never=${res.afterNever} final=${res.final} [${res.reason}]`,
    );
    for (const p of res.picks) {
      const meta = [p.creator, p.year].filter(Boolean).join(", ");
      console.log(`       • ${p.title}${meta ? ` — ${meta}` : ""}`);
    }

    for (const p of res.picks) sessionShown.add(normalizeTitle(p.title));
    if (firstUnderfill === null && res.final < RECOMMEND_COUNT) firstUnderfill = r;
    if (firstStarve === null && res.final === 0) firstStarve = r;
    if (res.final === 0) break; // fully starved — no point continuing
  }

  const fullRounds = results.filter((r) => r.final >= RECOMMEND_COUNT).length;
  const totalSurvivors = results.reduce((s, r) => s + r.final, 0);
  console.log(
    `\n  SUMMARY ${shelfId}: full rounds (≥${RECOMMEND_COUNT})=${fullRounds}/${results.length} · ` +
      `total unique-ish picks=${totalSurvivors} · ` +
      `first under-fill=${firstUnderfill ?? "none"} · first starve=${firstStarve ?? "none"}`,
  );
}

// ---- Main -------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const models = args.model ? [args.model] : RECOMMEND_MODELS;

  if (!args.dryRun && !process.env.AI_GATEWAY_API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY is required (add it to .env.local).");
  }

  const sb = createAdminClient();

  let userId = args.userId;
  if (!userId) {
    if (!args.email) {
      throw new Error("Provide --user <uuid> or --email <address> to target a library.");
    }
    userId = await resolveUserId(sb, args.email);
    if (!userId) throw new Error(`No user found for email ${args.email}.`);
  }

  console.log(`Eval target user: ${userId}`);
  console.log(`Rounds: ${args.rounds} · shelves: ${args.shelves.join(", ")}`);

  for (const shelf of args.shelves) {
    if (shelf === "watch" && !process.env.TMDB_API_KEY && !args.dryRun) {
      console.log(`\nSKIP watch: TMDB_API_KEY not set.`);
      continue;
    }
    await evalShelf(sb, userId, shelf, args.rounds, models, args.dryRun, args.recency);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

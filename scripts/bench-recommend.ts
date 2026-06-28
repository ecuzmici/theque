/**
 * Recommendation model benchmark harness.
 *
 * Tests Gateway models using the ADR 0002 redesign prompt (verdict-spine, signed
 * signal), computes auto-metrics, and emits a sorted table + blind taste-test.
 *
 * Run: npx tsx --env-file=.env.local scripts/bench-recommend.ts [--dry-run]
 * Requires: AI_GATEWAY_API_KEY in .env.local or environment.
 *
 * Note: OpenAI (gpt-5-nano, gpt-5-mini, gpt-5) and XAI (grok-4.1-fast-non-reasoning)
 * were NOT present in the Gateway catalog on 2026-06-28. The current shipped primary
 * (openai/gpt-5-nano from recommend-config.ts) is therefore absent from this roster.
 * Catalog verified at https://ai-gateway.vercel.sh/v1/models
 */

import { generateText } from "ai";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---- Env loading -------------------------------------------------------------------

function loadEnvLocal(): void {
  let contents: string;
  try {
    contents = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const sep = normalized.indexOf("=");
    if (sep <= 0) continue;
    const key = normalized.slice(0, sep).trim();
    let value = normalized.slice(sep + 1).trim();
    const q = value[0];
    if ((q === '"' || q === "'") && value.endsWith(q)) {
      value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

// ---- Types -------------------------------------------------------------------------

type BookItem = {
  title: string;
  author: string | null;
  year: string | null;
  status: "done" | "want" | "dismissed";
  rating: number | null;
  verdict: string | null;
  empty_structured: boolean;
};

type Candidate = {
  title: string;
  creator: string;
  year?: number | null;
  description: string;
  reason: string;
};

type ResolvedCandidate = Candidate & {
  resolved: boolean;
  canonical_url: string | null;
  cover_url: string | null;
  confirmed_year: number | null;
  verified_author: string | null;
};

type TrialOk = {
  ok: true;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  candidates: Candidate[];
  resolved: ResolvedCandidate[];
};

type TrialFail = {
  ok: false;
  latencyMs: number;
  error: string;
};

type TrialResult = TrialOk | TrialFail;

type ModelResult = {
  modelId: string;
  label: string;
  trials: TrialResult[];
  resolveRate: number;
  noveltyRate: number;
  uniqueAuthors: number;
  candidateCount: number;
  yearRange: number | null;
  p50LatencyMs: number;
  avgCostUsd: number;
  passesLatencyGate: boolean;
  tastePicks: ResolvedCandidate[];
};

// ---- Static fixture (frozen 2026-06-28) --------------------------------------------
// Owner's books shelf from Supabase project jucaqjkgyhyzixzaisjr, scoped to owner.
// Query: SELECT title, status, rating_personal, verdict,
//          structured->'authors'->>0 as author, structured->>'published_year' as year,
//          (structured = '{}'::jsonb) as empty_structured
//        FROM items JOIN auth.users ON user_id=id
//        WHERE email='<owner>' AND category='books'
//        ORDER BY (rating_personal IS NULL), rating_personal DESC, status, title

const BOOKS_FIXTURE: BookItem[] = [
  // --- DONE (verdicts drive the signed signal) ---
  { title: "Life As We Knew It (Last Survivors, #1)", author: "Susan Beth Pfeffer", year: null,   status: "done",      rating: 5, verdict: "very good, a bit too optimistic at the end", empty_structured: false },
  { title: "The 5th Wave (The 5th Wave, #1)",         author: "Rick Yancey",        year: null,   status: "done",      rating: 4, verdict: "a bit too fantasy for me, very cool concept", empty_structured: false },
  { title: "Wanderers",                                author: "Chuck Wendig",       year: "2019", status: "done",      rating: 2, verdict: "it's too slow, I gave up", empty_structured: false },
  // --- WANT (backlog, 18 items) ---
  { title: "Angel Down",                               author: "Daniel Kraus",        year: "2025", status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "Artificial Wisdom",                        author: "Thomas R. Weaver",    year: null,   status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "Down to a Sunless Sea",                   author: "David Graham",        year: null,   status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "Hyperion (Hyperion Cantos, #1)",           author: "Dan Simmons",         year: "1989", status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "Infinity Gate (Pandominion, #1)",          author: "M.R. Carey",          year: null,   status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "Moon of the Crusted Snow (Moon, #1)",      author: "Waubgeshig Rice",     year: null,   status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "Mr Wilman's Motoring Adventure: Top Gear, Grand Tour and Me", author: "Andy Wilman", year: "2025", status: "want", rating: null, verdict: null, empty_structured: false },
  { title: "Rendezvous with Rama (Rama, #1)",          author: "Arthur C. Clarke",    year: null,   status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "Sea of Rust",                              author: "C. Robert Cargill",   year: "2017", status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "Seveneves",                                author: "Neal Stephenson",     year: null,   status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "Shroud",                                   author: "Adrian Tchaikovsky",  year: "2024", status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "The Dervish House",                        author: "Ian McDonald",        year: "2010", status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "The Fifth Season (The Broken Earth, #1)",  author: "N.K. Jemisin",        year: "2015", status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "The Gone World",                           author: "Tom Sweterlitsch",    year: null,   status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "The Long Way to a Small, Angry Planet",    author: "Becky Chambers",      year: "2014", status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "The Man Who Folded Himself",               author: "David Gerrold",       year: null,   status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "The Shackleton Signal",                    author: "Joshua T. Calvert",   year: null,   status: "want",      rating: null, verdict: null, empty_structured: false },
  { title: "The Sword of Kaigen",                      author: "M.L. Wang",           year: null,   status: "want",      rating: null, verdict: null, empty_structured: false },
  // --- DISMISSED (title goes into NEVER, excluded from profile) ---
  { title: "A Drop of Corruption",                     author: null,                  year: null,   status: "dismissed", rating: null, verdict: null, empty_structured: true },
];

// ---- Normalization -----------------------------------------------------------------

/** Strip series suffixes like " (Series, #1)" and collapse whitespace. */
function stripSeries(title: string): string {
  return title
    .replace(/\s*\([^)]*#\d+[^)]*\)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Normalize for set-membership comparison (dedup / novelty). */
function normKey(title: string): string {
  return stripSeries(title)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an)\s+/, "");
}

// ---- Prompt builder (ADR 0002 redesign) --------------------------------------------

const SYSTEM_PROMPT =
  "You are the recommendation engine for Theque, a personal taste library. You " +
  "suggest books the reader is likely to love, learning from how they rated what " +
  "they have finished. Respond with only a single minified JSON object matching the " +
  "requested shape — no prose, no markdown, no code fences.";

function buildPrompt(books: BookItem[]): string {
  const loved = books.filter(
    (b) => b.status === "done" && b.rating !== null && b.rating >= 4 && !b.empty_structured,
  );
  const disliked = books
    .filter((b) => b.status === "done" && b.rating !== null && b.rating <= 2 && !b.empty_structured)
    .slice(0, 3);

  const usedBudget = loved.length + disliked.length;
  const backlogBudget = Math.max(0, 20 - usedBudget);
  const backlog = books
    .filter((b) => b.status === "want" && !b.empty_structured)
    .slice(0, backlogBudget);

  const neverLines = books
    .map((b) => `  - "${stripSeries(b.title)}"`)
    .join("\n");

  const fmt = (b: BookItem, withVerdict = true): string => {
    const title = stripSeries(b.title);
    const parts = [`"${title}"`];
    if (b.author) parts.push(`by ${collapseSpaces(b.author)}`);
    if (b.year) parts.push(`(${b.year})`);
    let line = `  - ${parts.join(" ")}`;
    if (withVerdict && b.verdict) line += ` — note: "${b.verdict}"`;
    return line;
  };

  const sections: string[] = [];

  if (loved.length > 0) {
    sections.push(`LOVED (rated 4–5★):\n${loved.map((b) => fmt(b)).join("\n")}`);
  }
  if (disliked.length > 0) {
    sections.push(
      `DISLIKED (rated 1–2★) — avoid books that resemble these:\n${disliked.map((b) => fmt(b)).join("\n")}`,
    );
  }
  if (backlog.length > 0) {
    sections.push(
      `BACKLOG (saved, unread — weaker signal):\n${backlog.map((b) => fmt(b, false)).join("\n")}`,
    );
  }

  sections.push(`NEVER suggest (already in library or dismissed):\n${neverLines}`);

  sections.push(`Rules:
  - Output identity only: title, creator (author name), year, 1–2 sentence spoiler-free description, 1 sentence "why you" reason.
  - Do NOT output URLs or links.
  - Mix well-known titles and deep cuts.
  - Vary author and publication era.
  - Never suggest any title from the NEVER list above.`);

  sections.push(
    `Respond with ONLY this JSON (minified, no prose):\n` +
      `{"candidates":[{"title":string,"creator":string,"year":number,"description":string,"reason":string}]}\n` +
      `Return exactly 8 candidates.`,
  );

  return sections.join("\n\n");
}

// ---- Open Library resolver (inlined — no server-only/SSRF guard needed) ------------

type OlDoc = {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
};

function olNorm(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an)\s+/, "");
}

function authorsOverlap(candidateCreator: string, docAuthors: string[]): boolean {
  const cTokens = candidateCreator
    .split(/[,&]|\band\b/i)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const dTokens = docAuthors.map((a) => a.toLowerCase());
  for (const ct of cTokens) {
    for (const dt of dTokens) {
      if (ct.includes(dt) || dt.includes(ct)) return true;
      const cParts = ct.split(/\s+/);
      const dParts = dt.split(/\s+/);
      for (const cp of cParts) {
        if (cp.length >= 3 && dParts.some((dp) => dp.includes(cp) || cp.includes(dp))) return true;
      }
    }
  }
  return false;
}

type Resolved = {
  canonical_url: string;
  cover_url: string | null;
  confirmed_year: number | null;
  verified_author: string | null;
};

async function resolveBook(c: { title: string; creator: string; year?: number | null }): Promise<Resolved | null> {
  const params = new URLSearchParams({
    title: c.title,
    language: "eng",
    limit: "5",
    fields: "key,title,author_name,first_publish_year,cover_i",
  });
  if (c.creator) params.set("author", c.creator);

  try {
    const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as { docs: OlDoc[] };
    const docs = raw.docs ?? [];
    if (!docs.length) return null;

    const normTitle = olNorm(c.title);

    if (c.creator) {
      for (const doc of docs) {
        if (olNorm(doc.title) !== normTitle) continue;
        if (!doc.author_name?.length) continue;
        if (authorsOverlap(c.creator, doc.author_name)) {
          return {
            canonical_url: `https://openlibrary.org${doc.key}`,
            cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
            confirmed_year: doc.first_publish_year ?? null,
            verified_author: doc.author_name.join(", "),
          };
        }
      }
    }

    const titleMatches = docs.filter((d) => olNorm(d.title) === normTitle);
    if (!titleMatches.length) return null;

    const best = titleMatches.sort((a, b) => {
      const diff = (b.cover_i ? 1 : 0) - (a.cover_i ? 1 : 0);
      if (diff !== 0) return diff;
      if (c.year && a.first_publish_year && b.first_publish_year) {
        return (
          Math.abs(a.first_publish_year - c.year) - Math.abs(b.first_publish_year - c.year)
        );
      }
      return 0;
    })[0];

    return {
      canonical_url: `https://openlibrary.org${best.key}`,
      cover_url: best.cover_i ? `https://covers.openlibrary.org/b/id/${best.cover_i}-L.jpg` : null,
      confirmed_year: best.first_publish_year ?? null,
      verified_author: best.author_name?.join(", ") ?? null,
    };
  } catch {
    return null;
  }
}

// ---- Model roster ------------------------------------------------------------------
// Verified 2026-06-28 via GET https://ai-gateway.vercel.sh/v1/models
// Pricing: USD per 1M tokens (catalog values × 1e6)

type ModelConfig = {
  id: string;
  role: string;
  providerOptions?: Record<string, unknown>;
  pricingPerM: { in: number; out: number };
};

const ROSTER: ModelConfig[] = [
  {
    id: "amazon/nova-micro",
    role: "cheapest baseline",
    pricingPerM: { in: 0.035, out: 0.14 },
  },
  {
    id: "google/gemini-2.5-flash-lite",
    role: "cheap Google (current shipped fallback)",
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    pricingPerM: { in: 0.10, out: 0.40 },
  },
  {
    id: "mistral/mistral-small",
    role: "cheap Mistral",
    pricingPerM: { in: 0.14, out: 0.42 },
  },
  {
    id: "deepseek/deepseek-v4-flash",
    role: "cheap DeepSeek",
    pricingPerM: { in: 0.14, out: 0.28 },
  },
  {
    id: "alibaba/qwen3.5-flash",
    role: "cheap Alibaba",
    pricingPerM: { in: 0.10, out: 0.40 },
  },
  {
    id: "google/gemini-2.5-flash",
    role: "mid Google (current shipped fallback)",
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    pricingPerM: { in: 0.30, out: 2.50 },
  },
  {
    id: "google/gemini-3.1-flash-lite",
    role: "newer Google lite",
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    pricingPerM: { in: 0.25, out: 1.50 },
  },
  {
    id: "anthropic/claude-haiku-4.5",
    role: "mid Anthropic (current shipped fallback)",
    pricingPerM: { in: 1.00, out: 5.00 },
  },
  {
    id: "google/gemini-3-flash",
    role: "flagship anchor",
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    pricingPerM: { in: 0.50, out: 3.00 },
  },
];

// ---- Benchmark config --------------------------------------------------------------

const TRIALS = 2;
const INTER_CALL_DELAY_MS = 4_000;
const TIMEOUT_MS = 25_000;
const LATENCY_GATE_MS = 15_000;
const TEMPERATURE = 0.5;
const OUTPUT_DIR = "/tmp/bench-recommend";

// ---- Trial runner ------------------------------------------------------------------

function stripFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```")) return t;
  return t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}

async function runTrial(model: ModelConfig, prompt: string): Promise<TrialResult> {
  const start = Date.now();
  try {
    const res = await generateText({
      model: model.id,
      system: SYSTEM_PROMPT,
      prompt,
      temperature: TEMPERATURE,
      ...(model.providerOptions
        ? {
            providerOptions:
              model.providerOptions as Parameters<typeof generateText>[0]["providerOptions"],
          }
        : {}),
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const latencyMs = Date.now() - start;
    const u = (res.usage ?? {}) as unknown as Record<string, number>;
    const inputTokens = u["inputTokens"] ?? u["promptTokens"] ?? 0;
    const outputTokens = u["outputTokens"] ?? u["completionTokens"] ?? 0;
    const reasoningTokens = u["reasoningTokens"] ?? 0;

    let candidates: Candidate[] = [];
    try {
      const parsed = JSON.parse(stripFence(res.text)) as { candidates?: unknown[] };
      candidates = (parsed.candidates ?? []).filter(
        (c): c is Candidate =>
          typeof (c as Candidate).title === "string" &&
          typeof (c as Candidate).creator === "string",
      );
    } catch {
      // invalid JSON — candidates stays empty, counted as a failed parse
    }

    const resolved: ResolvedCandidate[] = await Promise.all(
      candidates.map(async (c) => {
        const r = await resolveBook(c);
        return {
          ...c,
          resolved: r !== null,
          canonical_url: r?.canonical_url ?? null,
          cover_url: r?.cover_url ?? null,
          confirmed_year: r?.confirmed_year ?? null,
          verified_author: r?.verified_author ?? null,
        };
      }),
    );

    return { ok: true, latencyMs, inputTokens, outputTokens, reasoningTokens, candidates, resolved };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---- Metrics -----------------------------------------------------------------------

function libraryNormSet(books: BookItem[]): Set<string> {
  return new Set(books.map((b) => normKey(b.title)));
}

function computeMetrics(
  trials: TrialResult[],
  libSet: Set<string>,
  pricingPerM: { in: number; out: number },
): Omit<ModelResult, "modelId" | "label" | "trials"> {
  const okTrials = trials.filter((t): t is TrialOk => t.ok);

  const latencies = [...trials].map((t) => t.latencyMs).sort((a, b) => a - b);
  const p50LatencyMs = latencies[Math.floor(latencies.length / 2)] ?? 0;
  const passesLatencyGate = p50LatencyMs <= LATENCY_GATE_MS;

  // Best trial for taste picks = most resolved candidates
  const tasteTrial = [...okTrials].sort(
    (a, b) =>
      b.resolved.filter((r) => r.resolved).length - a.resolved.filter((r) => r.resolved).length,
  )[0];
  const tastePicks = tasteTrial?.resolved ?? [];

  // Aggregate across trials: dedupe by normalized title
  const seen = new Set<string>();
  const deduped: ResolvedCandidate[] = [];
  for (const t of okTrials) {
    for (const c of t.resolved) {
      const k = normKey(c.title);
      if (!seen.has(k)) {
        seen.add(k);
        deduped.push(c);
      }
    }
  }

  const candidateCount = deduped.length;
  const resolvedCount = deduped.filter((c) => c.resolved).length;
  const resolveRate = candidateCount > 0 ? resolvedCount / candidateCount : 0;

  const novelCount = deduped.filter((c) => !libSet.has(normKey(c.title))).length;
  const noveltyRate = candidateCount > 0 ? novelCount / candidateCount : 0;

  const uniqueAuthors = new Set(
    deduped.map((c) => (c.verified_author ?? c.creator).toLowerCase().trim()),
  ).size;

  const years = deduped
    .map((c) => c.confirmed_year)
    .filter((y): y is number => y !== null);
  const yearRange = years.length >= 2 ? Math.max(...years) - Math.min(...years) : null;

  const avgCostUsd =
    okTrials.length > 0
      ? okTrials.reduce((sum, t) => {
          return (
            sum +
            (t.inputTokens / 1e6) * pricingPerM.in +
            (t.outputTokens / 1e6) * pricingPerM.out
          );
        }, 0) / okTrials.length
      : 0;

  return {
    resolveRate,
    noveltyRate,
    uniqueAuthors,
    candidateCount,
    yearRange,
    p50LatencyMs,
    avgCostUsd,
    passesLatencyGate,
    tastePicks,
  };
}

// ---- Output helpers ----------------------------------------------------------------

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function sec(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function printMetricsTable(results: ModelResult[]): void {
  console.log("\n================ METRICS TABLE (sorted: gate → resolve-rate → novelty) ================\n");
  const header = ["Label", "Model", "Resolve", "Novelty", "Authors", "YrRange", "p50 Lat", "Cost/call", "Gate"];
  const rows: string[][] = results.map((r) => [
    r.label,
    r.modelId,
    pct(r.resolveRate),
    pct(r.noveltyRate),
    String(r.uniqueAuthors),
    r.yearRange !== null ? String(r.yearRange) + "y" : "—",
    sec(r.p50LatencyMs),
    `$${r.avgCostUsd.toFixed(5)}`,
    r.passesLatencyGate ? "PASS" : "FAIL >15s",
  ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)),
  );
  const pad = (s: string, w: number) => s.padEnd(w);
  const divider = widths.map((w) => "-".repeat(w)).join("-+-");
  console.log(header.map((h, i) => pad(h, widths[i]!)).join(" | "));
  console.log(divider);
  for (const row of rows) {
    console.log(row.map((c, i) => pad(c, widths[i]!)).join(" | "));
  }
}

function printBlindTastePicks(results: ModelResult[]): void {
  const passing = results.filter((r) => r.passesLatencyGate);
  console.log(
    "\n================ BLIND TASTE-TEST (rank these, then check the KEY below) ================\n",
  );
  for (const r of passing) {
    console.log(`### Model ${r.label}`);
    r.tastePicks.slice(0, 8).forEach((p, i) => {
      const author = p.verified_author ?? p.creator;
      const year = p.confirmed_year ?? p.year;
      const resolvedMark = p.resolved ? "✓" : "✗";
      console.log(`  ${i + 1}. "${p.title}" by ${author}${year ? ` (${year})` : ""} [${resolvedMark}]`);
      console.log(`     ${p.description}`);
      console.log(`     → ${p.reason}`);
    });
    console.log("");
  }

  console.log("--- KEY (reveal after you have ranked the above) ---");
  for (const r of passing) {
    console.log(`  ${r.label} = ${r.modelId}  (${r.modelId in ROSTER ? "" : ""}resolve=${pct(r.resolveRate)}, p50=${sec(r.p50LatencyMs)})`);
  }
}

// ---- Dry run -----------------------------------------------------------------------

function dryRun(prompt: string): void {
  console.log("--- PROMPT ---\n");
  console.log(prompt);
  console.log("\n--- STATS ---");
  console.log(`Prompt length: ${prompt.length} chars`);
  console.log(`Roster: ${ROSTER.length} models × ${TRIALS} trials`);
  ROSTER.forEach((m, i) => console.log(`  ${String.fromCharCode(65 + i)}. ${m.id}  (${m.role})`));
}

// ---- Main --------------------------------------------------------------------------

function isMainModule(): boolean {
  const ep = process.argv[1];
  if (!ep) return false;
  return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(ep);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  loadEnvLocal();

  const isDry = process.argv.includes("--dry-run");
  const prompt = buildPrompt(BOOKS_FIXTURE);

  if (isDry) {
    dryRun(prompt);
    return;
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error(
      "AI_GATEWAY_API_KEY is required.\n" +
        "Add it to .env.local (Vercel dashboard → AI Gateway → API Keys).\n" +
        "The pricing endpoint works unauthenticated; generation does not.",
    );
  }

  const libSet = libraryNormSet(BOOKS_FIXTURE);
  const lovedCount = BOOKS_FIXTURE.filter((b) => b.rating !== null && b.rating >= 4).length;
  const dislikedCount = BOOKS_FIXTURE.filter((b) => b.rating !== null && b.rating <= 2).length;
  const backlogCount = BOOKS_FIXTURE.filter((b) => b.status === "want").length;

  console.log(
    `Fixture: ${BOOKS_FIXTURE.length} books (${lovedCount} loved, ${dislikedCount} disliked, ${backlogCount} backlog)`,
  );
  console.log(`Prompt: ${prompt.length} chars | Roster: ${ROSTER.length} models × ${TRIALS} trials\n`);

  const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const modelResults: ModelResult[] = [];
  let callIndex = 0;
  const totalCalls = ROSTER.length * TRIALS;

  for (let mi = 0; mi < ROSTER.length; mi++) {
    const model = ROSTER[mi]!;
    const label = labels[mi] ?? String(mi + 1);
    const trials: TrialResult[] = [];

    for (let t = 0; t < TRIALS; t++) {
      callIndex++;
      process.stdout.write(
        `[${callIndex}/${totalCalls}] ${model.id} trial ${t + 1} ... `,
      );
      const result = await runTrial(model, prompt);
      trials.push(result);

      if (result.ok) {
        const rCount = result.resolved.filter((r) => r.resolved).length;
        console.log(
          `${sec(result.latencyMs)} | ${result.candidates.length} candidates | ${rCount} resolved`,
        );
      } else {
        const fail = result as TrialFail;
        console.log(`FAILED: ${fail.error}`);
      }

      const isLast = mi === ROSTER.length - 1 && t === TRIALS - 1;
      if (!isLast) await delay(INTER_CALL_DELAY_MS);
    }

    const metrics = computeMetrics(trials, libSet, model.pricingPerM);
    modelResults.push({ modelId: model.id, label, trials, ...metrics });
  }

  // Sort: passing gate first, then resolve-rate desc, novelty desc, latency asc
  const sorted = [...modelResults].sort((a, b) => {
    if (a.passesLatencyGate !== b.passesLatencyGate) return a.passesLatencyGate ? -1 : 1;
    if (b.resolveRate !== a.resolveRate) return b.resolveRate - a.resolveRate;
    if (b.noveltyRate !== a.noveltyRate) return b.noveltyRate - a.noveltyRate;
    return a.p50LatencyMs - b.p50LatencyMs;
  });

  printMetricsTable(sorted);
  printBlindTastePicks(sorted);

  // Write results to output dir
  await mkdir(OUTPUT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  const outPath = path.join(OUTPUT_DIR, `results-${timestamp}.json`);
  const mdPath = path.join(OUTPUT_DIR, `results-${timestamp}.md`);

  const fullOutput = {
    generatedAt: new Date().toISOString(),
    fixture: { total: BOOKS_FIXTURE.length, loved: lovedCount, disliked: dislikedCount, backlog: backlogCount },
    promptChars: prompt.length,
    prompt,
    config: { trials: TRIALS, timeoutMs: TIMEOUT_MS, latencyGateMs: LATENCY_GATE_MS, temperature: TEMPERATURE },
    roster: ROSTER.map((m) => ({ id: m.id, role: m.role })),
    results: sorted.map((r) => ({
      label: r.label,
      modelId: r.modelId,
      resolveRate: r.resolveRate,
      noveltyRate: r.noveltyRate,
      uniqueAuthors: r.uniqueAuthors,
      candidateCount: r.candidateCount,
      yearRange: r.yearRange,
      p50LatencyMs: r.p50LatencyMs,
      avgCostUsd: r.avgCostUsd,
      passesLatencyGate: r.passesLatencyGate,
      tastePicks: r.tastePicks,
      trials: r.trials.map((t) => {
        if (t.ok) {
          return {
            ok: true,
            latencyMs: t.latencyMs,
            inputTokens: t.inputTokens,
            outputTokens: t.outputTokens,
            reasoningTokens: t.reasoningTokens,
            candidateCount: t.candidates.length,
            resolvedCount: t.resolved.filter((x) => x.resolved).length,
            candidates: t.resolved,
          };
        }
        const fail = t as TrialFail;
        return { ok: false, latencyMs: fail.latencyMs, error: fail.error };
      }),
    })),
  };

  await writeFile(outPath, JSON.stringify(fullOutput, null, 2));
  console.log(`\nJSON → ${outPath}`);

  // Minimal markdown summary
  const mdLines = [
    `# Recommendation model benchmark — ${new Date().toISOString().slice(0, 10)}`,
    "",
    `Fixture: ${BOOKS_FIXTURE.length} books (${lovedCount} loved, ${dislikedCount} disliked, ${backlogCount} backlog)`,
    `Prompt: ${prompt.length} chars | Gate: p50 ≤ ${LATENCY_GATE_MS / 1000}s`,
    "",
    "| Label | Model | Resolve | Novelty | Authors | YrRange | p50 Lat | Cost | Gate |",
    "| ----- | ----- | ------- | ------- | ------- | ------- | ------- | ---- | ---- |",
    ...sorted.map(
      (r) =>
        `| ${r.label} | ${r.modelId} | ${pct(r.resolveRate)} | ${pct(r.noveltyRate)} | ${r.uniqueAuthors} | ${r.yearRange !== null ? r.yearRange + "y" : "—"} | ${sec(r.p50LatencyMs)} | $${r.avgCostUsd.toFixed(5)} | ${r.passesLatencyGate ? "PASS" : "FAIL"} |`,
    ),
    "",
    "## Key",
    ...sorted.filter((r) => r.passesLatencyGate).map((r) => `- **${r.label}** = ${r.modelId}`),
  ];
  await writeFile(mdPath, mdLines.join("\n") + "\n");
  console.log(`MD   → ${mdPath}`);
}

if (isMainModule()) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}

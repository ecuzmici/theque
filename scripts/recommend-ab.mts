/**
 * Throwaway A/B harness for the AI recommendation LLM layer.
 *
 * Runs the SAME prompt (faithful copy of buildRecommendPrompt for the "books"
 * shelf) against several Gateway models / configs and reports, per scenario:
 *   - wall-clock latency
 *   - input / output / reasoning tokens
 *   - estimated token cost
 *   - the recommended titles
 *
 * Run: npx tsx --env-file=.env.local scripts/recommend-ab.mts
 * Requires AI_GATEWAY_API_KEY (Vercel dashboard → AI Gateway → API Keys).
 */

import { generateText } from "ai";

// ---- Payload (the user's 15 books) -------------------------------------------------
type Item = { title: string; creator: string | null; year: number | null };
const ITEMS: Item[] = [
  { title: "Moon of the Crusted Snow (Moon, #1)", creator: "Waubgeshig Rice", year: null },
  { title: "Rendezvous with Rama (Rama, #1)", creator: "Arthur C. Clarke", year: null },
  { title: "Down to a Sunless Sea", creator: "David Graham", year: null },
  { title: "Angel Down", creator: "Daniel Kraus", year: null },
  { title: "The Fifth Season (The Broken Earth, #1)", creator: "N.K. Jemisin", year: null },
  { title: "Wanderers (Wanderers, #1)", creator: "Chuck Wendig", year: null },
  { title: "The 5th Wave (The 5th Wave, #1)", creator: "Rick Yancey", year: null },
  { title: "Life As We Knew It (Last Survivors, #1)", creator: "Susan Beth Pfeffer", year: null },
  { title: "Seveneves", creator: null, year: null },
  { title: "Shroud", creator: "Adrian Tchaikovsky", year: null },
  { title: "The Shackleton Signal", creator: null, year: null },
  { title: "Artificial Wisdom", creator: "Thomas R. Weaver", year: null },
  { title: "Infinity Gate (Pandominion, #1)", creator: "M.R. Carey", year: null },
  { title: "The Man Who Folded Himself", creator: "David Gerrold", year: null },
  { title: "The Sword of Kaigen", creator: "M.L. Wang", year: null },
];

// ---- Faithful copy of the production prompt (books shelf) --------------------------
const RECOMMEND_OVER_REQUEST = 8;
function formatItem(item: Item): string {
  const parts: string[] = [`"${item.title}"`];
  if (item.creator) parts.push(`by ${item.creator}`);
  if (item.year) parts.push(`(${item.year})`);
  return `- ${parts.join(" ")}`;
}
function buildPrompt(items: Item[]): string {
  const label = "books";
  const creatorLabel = "author";
  const formatted = items.map(formatItem).join("\n");
  return [
    `Role: recommendation engine for Theque, a personal taste library.`,
    `Task: given the user's saved ${label}, suggest ${RECOMMEND_OVER_REQUEST} other ${label} they'd likely enjoy.`,
    `Look for patterns in genre, tone, era, themes, style.`,
    ``,
    `Rules:`,
    `- Never suggest a title already in the user's list (shown below).`,
    `- Output identity only: title, ${creatorLabel} (as "creator"), year, a 1–2 sentence spoiler-free description, and one sentence on why it connects to their library.`,
    `- Do NOT output URLs or links of any kind.`,
    `- Mix well-known and lesser-known titles.`,
    ``,
    `User's ${label}:`,
    formatted,
    ``,
    `Respond with ONLY a JSON object of exactly this shape (no other text):`,
    `{"candidates":[{"title":string,"creator":string,"year":number,"description":string,"reason":string}]}`,
    `Return ${RECOMMEND_OVER_REQUEST} candidates in the array.`,
  ].join("\n");
}

const JSON_SYSTEM =
  "You are a precise data API. Respond with only a single valid, minified JSON value " +
  "matching the requested shape. No prose, no explanation, no markdown, no code fences.";

function stripCodeFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```")) return t;
  return t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}

// ---- Pricing ($ per 1M tokens), from Vercel AI Gateway catalog --------------------
// $/1M tokens. Newer entries are best-effort estimates — token counts are exact regardless.
const PRICE: Record<string, { in: number; out: number }> = {
  "openai/gpt-5-mini": { in: 0.25, out: 2.0 },
  "google/gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "google/gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "deepseek/deepseek-v4-flash": { in: 0.14, out: 0.28 },
  "moonshotai/kimi-k2.6": { in: 0.95, out: 4.0 },
  "openai/gpt-5-nano": { in: 0.05, out: 0.4 },
  "openai/gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "anthropic/claude-haiku-4.5": { in: 1.0, out: 5.0 },
  "zai/glm-5.1": { in: 1.3, out: 3.0 },
  "alibaba/qwen3.7-plus": { in: 0.4, out: 1.2 },
  "xai/grok-4.3": { in: 3.0, out: 15.0 },
};

// ---- Scenarios --------------------------------------------------------------------
type Scenario = {
  name: string;
  model: string;
  temperature: number;
  providerOptions?: Record<string, unknown>;
};
// Consistency check of the SHIPPED recommend config (gpt-5-nano, reasoning=minimal,
// temp 0.5) — does it reliably return 8 valid candidates, or under-produce / emit
// bad JSON the way nano did on the enrichment task? flash-lite (fallback) for ref.
const SCENARIOS: Scenario[] = [
  { name: "gpt-5-nano run 1", model: "openai/gpt-5-nano", temperature: 0.5, providerOptions: { openai: { reasoningEffort: "minimal" } } },
  { name: "gpt-5-nano run 2", model: "openai/gpt-5-nano", temperature: 0.5, providerOptions: { openai: { reasoningEffort: "minimal" } } },
  { name: "gpt-5-nano run 3", model: "openai/gpt-5-nano", temperature: 0.5, providerOptions: { openai: { reasoningEffort: "minimal" } } },
  { name: "gpt-5-nano run 4", model: "openai/gpt-5-nano", temperature: 0.5, providerOptions: { openai: { reasoningEffort: "minimal" } } },
  { name: "gemini-2.5-flash-lite (fallback ref)", model: "google/gemini-2.5-flash-lite", temperature: 0.5 },
];

const PROMPT = buildPrompt(ITEMS);

const ONLY = process.env.AB_ONLY;
const ACTIVE = ONLY ? SCENARIOS.filter((s) => s.name.toLowerCase().includes(ONLY.toLowerCase())) : SCENARIOS;

type Row = {
  name: string;
  model: string;
  ok: boolean;
  ms: number;
  inTok: number;
  outTok: number;
  reasonTok: number;
  costUsd: number;
  titles: string[];
  error?: string;
};

async function runScenario(s: Scenario): Promise<Row> {
  const start = Date.now();
  try {
    const res = await generateText({
      model: s.model,
      system: JSON_SYSTEM,
      prompt: PROMPT,
      temperature: s.temperature,
      ...(s.providerOptions ? { providerOptions: s.providerOptions as Parameters<typeof generateText>[0]["providerOptions"] } : {}),
      abortSignal: AbortSignal.timeout(Number(process.env.AB_TIMEOUT_MS ?? "90000")),
    });
    const ms = Date.now() - start;
    const u = (res.usage ?? {}) as Partial<Record<"inputTokens" | "outputTokens" | "reasoningTokens", number>>;
    const inTok = u.inputTokens ?? 0;
    const outTok = u.outputTokens ?? 0;
    const reasonTok = u.reasoningTokens ?? 0;
    const price = PRICE[s.model] ?? { in: 0, out: 0 };
    const costUsd = (inTok / 1e6) * price.in + (outTok / 1e6) * price.out;

    let titles: string[] = [];
    try {
      const parsed = JSON.parse(stripCodeFence(res.text)) as { candidates?: { title?: string; creator?: string }[] };
      titles = (parsed.candidates ?? []).map((c) => `${c.title}${c.creator ? " — " + c.creator : ""}`);
    } catch {
      titles = ["<<unparseable JSON>>"];
    }
    return { name: s.name, model: s.model, ok: true, ms, inTok, outTok, reasonTok, costUsd, titles };
  } catch (err) {
    return {
      name: s.name, model: s.model, ok: false, ms: Date.now() - start,
      inTok: 0, outTok: 0, reasonTok: 0, costUsd: 0, titles: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log(`Prompt length: ${PROMPT.length} chars\n`);
  const rows: Row[] = [];
  // Sequential so latency numbers aren't skewed by shared CPU/network contention.
  for (let i = 0; i < ACTIVE.length; i++) {
    const s = ACTIVE[i];
    process.stdout.write(`Running: ${s.name} ... `);
    const row = await runScenario(s);
    console.log(row.ok ? `${(row.ms / 1000).toFixed(1)}s` : `FAILED (${row.error})`);
    rows.push(row);
    // Small delay between calls to stay under any per-minute rate limit.
    if (i < ACTIVE.length - 1) await new Promise((r) => setTimeout(r, 4000));
  }

  console.log("\n================ SUMMARY ================\n");
  for (const r of rows) {
    console.log(`### ${r.name}`);
    console.log(`    model:    ${r.model}`);
    if (!r.ok) {
      console.log(`    ERROR:    ${r.error}\n`);
      continue;
    }
    console.log(`    latency:  ${(r.ms / 1000).toFixed(2)}s`);
    console.log(`    tokens:   in=${r.inTok}  out=${r.outTok}  reasoning=${r.reasonTok}`);
    console.log(`    cost:     $${r.costUsd.toFixed(6)}  (≈ $${(r.costUsd * 1000).toFixed(3)} / 1k calls)`);
    console.log(`    picks:`);
    r.titles.forEach((t, i) => console.log(`      ${i + 1}. ${t}`));
    console.log("");
  }

  // Compact comparison table
  console.log("================ TABLE ================");
  console.log("scenario\tlatency_s\tin\tout\treason\tcost_usd");
  for (const r of rows) {
    if (!r.ok) { console.log(`${r.name}\tFAIL\t-\t-\t-\t-`); continue; }
    console.log(`${r.name}\t${(r.ms / 1000).toFixed(2)}\t${r.inTok}\t${r.outTok}\t${r.reasonTok}\t${r.costUsd.toFixed(6)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

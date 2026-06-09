/**
 * Throwaway harness for the category-enrichment LLM layer, run over multiple
 * real Goodreads books to avoid an n=1 conclusion.
 *
 * Each book is fed a TRUNCATED og:description (reproducing the real extractor
 * failure mode seen in prod) plus deterministic structured fields. We compare:
 *   - gpt-5-nano + current prompt   (the shipped local default)
 *   - gpt-5-nano + improved prompt  (does a better prompt rescue nano?)
 *   - gemini-2.5-flash-lite + improved prompt (proposed fix)
 *
 * Run: $env:AI_GATEWAY_API_KEY='...'; npx tsx scripts/enrich-ab.mts
 */

import { generateText } from "ai";

type Book = {
  label: string;
  finalUrl: string;
  title: string;
  truncatedDescription: string; // what the extractor actually captured
  image_url: string;
  structured: Record<string, unknown>;
  json_ld: unknown[];
};

const BOOKS: Book[] = [
  {
    label: "Down to a Sunless Sea (post-apoc SF)",
    finalUrl: "https://www.goodreads.com/book/show/2034476.Down_to_a_Sunless_Sea",
    title: "Down to a Sunless Sea",
    truncatedDescription: "The six hundred passengers and crew members aboard a ju",
    image_url: "https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1354847319i/2034476.jpg",
    structured: { isbn: "9781416567660", authors: ["David Graham"], page_count: 352, ratings_count: 991, average_rating: 3.89, site_name: "Goodreads" },
    json_ld: [{ "@type": "Book", name: "Down to a Sunless Sea", author: [{ "@type": "Person", name: "David Graham" }], numberOfPages: 352, aggregateRating: { ratingValue: 3.89, ratingCount: 993 } }],
  },
  {
    label: "The Fifth Season (SFF, series)",
    finalUrl: "https://www.goodreads.com/book/show/19161852-the-fifth-season",
    title: "The Fifth Season (The Broken Earth, #1)",
    truncatedDescription: "This is the way the world ends. Again. Three terrible things happen in a single day. Essun, a woman living an ordinary life in a small town, comes ho",
    image_url: "https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1386803701i/19161852.jpg",
    structured: { authors: ["N.K. Jemisin"], page_count: 468, ratings_count: 346396, average_rating: 4.28, site_name: "Goodreads" },
    json_ld: [{ "@type": "Book", name: "The Fifth Season", author: [{ "@type": "Person", name: "N.K. Jemisin" }], numberOfPages: 468, aggregateRating: { ratingValue: 4.28, ratingCount: 346396 } }],
  },
  {
    label: "Seveneves (hard SF, long)",
    finalUrl: "https://www.goodreads.com/book/show/22816087-seveneves",
    title: "Seveneves",
    truncatedDescription: "What would happen if the world were ending? A catastrophic event renders the world a ticking time bomb. In a feverish race against the inevitable, na",
    image_url: "https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1449142000i/22816087.jpg",
    structured: { authors: ["Neal Stephenson"], page_count: 872, ratings_count: 126893, average_rating: 4.0, site_name: "Goodreads" },
    json_ld: [{ "@type": "Book", name: "Seveneves", author: [{ "@type": "Person", name: "Neal Stephenson" }], numberOfPages: 872, aggregateRating: { ratingValue: 4.0, ratingCount: 126893 } }],
  },
  {
    label: "From Twinkle, with Love (YA romance)",
    finalUrl: "https://www.goodreads.com/book/show/36373464-from-twinkle-with-love",
    title: "From Twinkle, with Love",
    truncatedDescription: "Aspiring filmmaker and wallflower Twinkle Mehra has stories she wants to tell and universes she wants to explore, if only the world would listen. So w",
    image_url: "https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1519633175i/36373464.jpg",
    structured: { authors: ["Sandhya Menon"], page_count: 336, ratings_count: 10913, average_rating: 3.6, site_name: "Goodreads" },
    json_ld: [{ "@type": "Book", name: "From Twinkle, with Love", author: [{ "@type": "Person", name: "Sandhya Menon" }], numberOfPages: 336, aggregateRating: { ratingValue: 3.6, ratingCount: 10913 } }],
  },
];

function og(b: Book) {
  return { title: b.title, description: b.truncatedDescription, image: b.image_url, site_name: "Goodreads", type: "books.book" };
}

function buildCurrentPrompt(b: Book): string {
  return [
    "You are normalizing metadata for a private visual bookmark library called Theque.",
    "The deterministic category is fixed: books.",
    "Do not change or return a different category.",
    "Use only the provided URL and metadata evidence.",
    "Return only fields allowed for the fixed category.",
    "Omit fields when evidence is insufficient. Do not invent prices, ratings, authors, years, or addresses.",
    "",
    `URL: ${b.finalUrl}`,
    `Title: ${b.title}`,
    `Subtitle: `,
    `Description: ${b.truncatedDescription}`,
    `Image URL: ${b.image_url}`,
    `Structured: ${JSON.stringify(b.structured)}`,
    `Open Graph: ${JSON.stringify(og(b))}`,
    `Twitter: ${JSON.stringify({})}`,
    `JSON-LD: ${JSON.stringify(b.json_ld)}`,
    `Parser: generic`,
    "",
    "Respond with ONLY a JSON object. Required keys: confidence (number 0-1), sources (array of strings).",
    "Optional keys (omit when evidence is insufficient): title, subtitle, description, image_url, structured (object), notes.",
  ].join("\n");
}

function buildImprovedPrompt(b: Book): string {
  return [
    "You are normalizing metadata for a private visual bookmark library called Theque.",
    "The deterministic category is fixed: books. Do not change the category.",
    "Use the provided URL and metadata evidence. You may rely on widely-known facts about a clearly-identified work to write a clean description, but never invent prices, ratings, page counts, ISBNs, dates, or addresses not present in the evidence.",
    "",
    "Field rules:",
    "- title: the work's title only (no author).",
    "- subtitle: ONLY a real subtitle, series name, or edition (e.g. 'The Broken Earth #1'). NEVER the author's name. Omit if there is none.",
    "- description: a complete, spoiler-free 1-3 sentence summary. Do NOT echo a truncated blurb; if the evidence description ends mid-sentence, rewrite it cleanly. No marketing exclamations.",
    "- structured: for books, include any of { genres (array), series, published_year } the evidence or well-known facts support. Omit unknown fields. Do not restate isbn/page_count/ratings already provided.",
    "",
    `URL: ${b.finalUrl}`,
    `Title: ${b.title}`,
    `Subtitle: `,
    `Description: ${b.truncatedDescription}`,
    `Image URL: ${b.image_url}`,
    `Structured: ${JSON.stringify(b.structured)}`,
    `Open Graph: ${JSON.stringify(og(b))}`,
    `JSON-LD: ${JSON.stringify(b.json_ld)}`,
    "",
    "Respond with ONLY a JSON object. Required keys: confidence (number 0-1), sources (array of strings).",
    "Optional keys (omit when insufficient): title, subtitle, description, image_url, structured (object), notes.",
  ].join("\n");
}

function buildSafePrompt(b: Book): string {
  return [
    "You are normalizing metadata for a private visual bookmark library called Theque.",
    "The deterministic category is fixed: books. Do not change the category.",
    "Use ONLY the provided URL and metadata evidence. Do not invent prices, ratings, page counts, ISBNs, dates, addresses, or plot details.",
    "",
    "Field rules:",
    "- title: the work's title only (no author).",
    "- subtitle: ONLY a real subtitle, series name, or edition (e.g. 'The Broken Earth #1'). NEVER the author's name. Omit if there is none.",
    "- description: if the provided description is cut off mid-sentence, TRIM it to the last complete sentence; do not complete or invent the rest. If no complete sentence is available, omit description. Never fabricate a plot.",
    "- structured: include genres (array), series, or published_year ONLY if you are confident they are correct for this specific, clearly-identified work; otherwise omit them. Do not restate isbn/page_count/ratings already provided.",
    "",
    `URL: ${b.finalUrl}`,
    `Title: ${b.title}`,
    `Subtitle: `,
    `Description: ${b.truncatedDescription}`,
    `Image URL: ${b.image_url}`,
    `Structured: ${JSON.stringify(b.structured)}`,
    `Open Graph: ${JSON.stringify(og(b))}`,
    `JSON-LD: ${JSON.stringify(b.json_ld)}`,
    "",
    "Respond with ONLY a JSON object. Required keys: confidence (number 0-1), sources (array of strings).",
    "Optional keys (omit when insufficient): title, subtitle, description, image_url, structured (object), notes.",
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

type Scenario = { name: string; model: string; build: (b: Book) => string; providerOptions?: Record<string, unknown> };
// Validation of the shipped fix: extractor now supplies the FULL description,
// and we keep the CURRENT prompt. Confirm flash-lite neither truncates nor
// hallucinates when given complete evidence.
const FULL: Record<string, string> = {
  "Down to a Sunless Sea": "The six hundred passengers and crew members aboard a jumbo jetliner are left without a destination and a country when nuclear war breaks out and spreads devastation around the world. A collapsed economy and an increasingly savage society were causing thousands to abandon America. Captain Jonah Scott was a pilot, hired to fly some lucky refugees to London. But once in the air, nuclear war broke out, and Scott became responsible for the entire human race!",
  "The Fifth Season": "This is the way the world ends. Again. Three terrible things happen in a single day. Essun, a woman living an ordinary life in a small town, comes home to find that her husband has brutally murdered their son and kidnapped their daughter. Meanwhile, mighty Sanze -- the world-spanning empire whose innovations have been civilization's bedrock for a thousand years -- collapses as most of its citizens are murdered to serve a madman's vengeance.",
  Seveneves: "A catastrophic event renders the Earth a ticking time bomb. In a feverish race against the inevitable, nations around the globe band together to devise an ambitious plan to ensure the survival of humanity far beyond our atmosphere, in outer space.",
  "From Twinkle, with Love": "Aspiring filmmaker and wallflower Twinkle Mehra has stories she wants to tell and universes she wants to explore, if only the world would listen. So when fellow film geek Sahil Roy approaches her to direct a movie for the upcoming Summer Festival, Twinkle is all over it.",
};
BOOKS.forEach((b) => { const key = Object.keys(FULL).find((k) => b.title.startsWith(k)); if (key) b.truncatedDescription = FULL[key]; });

const SCENARIOS: Scenario[] = [
  { name: "flash-lite · CURRENT prompt + FULL description (shipped)", model: "google/gemini-2.5-flash-lite", build: buildCurrentPrompt },
];

async function run(model: string, prompt: string, providerOptions?: Record<string, unknown>) {
  const start = Date.now();
  const res = await generateText({
    model,
    system: JSON_SYSTEM,
    prompt,
    temperature: 0.1,
    ...(providerOptions ? { providerOptions: providerOptions as Parameters<typeof generateText>[0]["providerOptions"] } : {}),
    abortSignal: AbortSignal.timeout(60_000),
  });
  const ms = Date.now() - start;
  let parsed: any;
  try { parsed = JSON.parse(stripCodeFence(res.text)); } catch { parsed = { _raw: res.text }; }
  return { ms, parsed };
}

/** One-line quality summary of a parsed enrichment payload. */
function summarize(p: any): string {
  if (!p || typeof p !== "object") return "no object";
  const keys = Object.keys(p).filter((k) => k !== "confidence" && k !== "sources");
  if (keys.length === 0) return "EMPTY (confidence+sources only)";
  const desc = typeof p.description === "string" ? `${p.description.length}c` : "—";
  const sub = "subtitle" in p ? JSON.stringify(p.subtitle) : "(omitted)";
  const struct = p.structured ? JSON.stringify(p.structured) : "(none)";
  return `fields=[${keys.join(",")}] desc=${desc} subtitle=${sub} structured=${struct}`;
}

async function main() {
  for (const b of BOOKS) {
    console.log(`\n================ ${b.label} ================`);
    for (const s of SCENARIOS) {
      try {
        const { ms, parsed } = await run(s.model, s.build(b), s.providerOptions);
        console.log(`\n[${s.name}] ${(ms / 1000).toFixed(1)}s — ${summarize(parsed)}`);
        if (typeof parsed.description === "string") console.log(`  desc: ${parsed.description}`);
      } catch (err) {
        console.log(`\n[${s.name}] FAILED: ${err instanceof Error ? err.message : String(err)}`);
      }
      await new Promise((r) => setTimeout(r, 3500));
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

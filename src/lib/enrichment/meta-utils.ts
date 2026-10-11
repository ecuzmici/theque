export function parseIsoDurationMinutes(duration: unknown): number | undefined {
  if (typeof duration !== "string" || !duration.startsWith("PT")) return undefined;
  const hours = duration.match(/(\d+)H/i);
  const minutes = duration.match(/(\d+)M/i);
  let total = 0;
  if (hours) total += Number.parseInt(hours[1], 10) * 60;
  if (minutes) total += Number.parseInt(minutes[1], 10);
  return total > 0 ? total : undefined;
}

export function personNames(val: unknown): string[] {
  if (!val) return [];
  const list = Array.isArray(val) ? val : [val];
  const names: string[] = [];
  for (const entry of list) {
    if (typeof entry === "string") names.push(entry);
    else if (entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string") {
      names.push((entry as { name: string }).name);
    }
  }
  return names;
}

const ERROR_TITLE_RE =
  /\b(404|not found|page cannot be found|bot or not|access denied|forbidden|just a moment|attention required|verifying you are human|checking your browser)\b/i;

export function isErrorPageTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return false;
  return ERROR_TITLE_RE.test(title);
}

export function isBotBlockPage(html: string, statusCode: number): boolean {
  if (statusCode === 202 || statusCode === 402 || statusCode === 403 || statusCode === 429) return true;
  if (html.length < 8000 && /awsWafCookieDomainList|gokuProps|cf-browser-verification|challenge-platform/i.test(html)) {
    return true;
  }
  return false;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

/**
 * Decode HTML character references in a short text field. A model sometimes
 * returns `&apos;` inside a title, and a page sometimes double-encodes one.
 * The value goes into a file name and into EPUB metadata, so it must be plain
 * text. Two passes clear a double encoding such as `&amp;apos;`.
 */
export function decodeHtmlEntities(value: string): string {
  let out = value;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
      const token = body.toLowerCase();
      if (token.startsWith("#x")) {
        const code = Number.parseInt(body.slice(2), 16);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
      }
      if (token.startsWith("#")) {
        const code = Number.parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[token] ?? match;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * A title that ends in an ellipsis is cut short by the source page. Goodreads
 * truncates a long title in its `og:title`, sometimes in the middle of a word.
 * A resolver or a hint gives the full title, so treat the cut one as weak.
 */
export function isTruncatedTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return false;
  return /(\u2026|\.\.\.)$/.test(title.trim());
}

export function isWeakTitle(title: string | null | undefined, siteName?: string): boolean {
  if (!title?.trim()) return true;
  const t = title.trim();
  if (isErrorPageTitle(t)) return true;
  if (isTruncatedTitle(t)) return true;
  if (siteName && t.toLowerCase() === siteName.toLowerCase()) return true;
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) return true;
  const generic = new Set([
    "google maps",
    "amazon.com",
    "imdb",
    "bbc",
    "tripadvisor.com",
    "etsy.com",
    "nytimes.com",
  ]);
  if (generic.has(t.toLowerCase())) return true;
  return false;
}

const BLOCK_TEXT_RE =
  /\b(access denied|robot check|are you a robot|are you a human|enable javascript|captcha|verify you are|unusual traffic)\b/i;

/**
 * A description that should not block an LLM replacement: missing, too short
 * to be useful, or error/bot-wall boilerplate that leaked into metadata.
 */
export function isJunkDescription(description: string | null | undefined): boolean {
  if (!description?.trim()) return true;
  const d = description.trim();
  if (d.length < 30) return true;
  return isErrorPageTitle(d) || BLOCK_TEXT_RE.test(d);
}

export function parseTitleTag(titleTag: string | undefined, siteName?: string): string | undefined {
  if (!titleTag?.trim()) return undefined;
  let t = titleTag.trim();
  if (siteName) {
    const suffixes = [` - ${siteName}`, ` | ${siteName}`, ` — ${siteName}`];
    for (const suffix of suffixes) {
      if (t.endsWith(suffix)) {
        t = t.slice(0, -suffix.length).trim();
        break;
      }
    }
  }
  const parenYear = t.match(/^(.+?)\s*\(\d{4}\)\s*$/);
  if (parenYear) t = parenYear[1].trim();
  return t || undefined;
}

/**
 * True for an image a site renders as a share card: a picture of the page
 * (title text, stars, tags), not the cover. Only hardcover.app today (#78).
 */
export function isGeneratedShareCard(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const hardcover = host === "hardcover.app" || host.endsWith(".hardcover.app");
    return hardcover && /\/ogimage\.png$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export type ImdbTitleParts = { title: string; year?: number; genres?: string[] };

/**
 * Split an IMDb page title into its parts. IMDb `og:title` now carries the
 * year, the rating and the genres:
 * "Twin Peaks (TV Series 1990–1991) ⭐ 8.7 | Crime, Drama, Mystery".
 * Returns undefined when nothing is left after the cleanup.
 */
export function parseImdbTitle(raw: string | undefined): ImdbTitleParts | undefined {
  if (!raw?.trim()) return undefined;
  let t = raw.trim();
  let genres: string[] | undefined;

  const pipe = t.indexOf(" | ");
  if (pipe !== -1) {
    const tail = t.slice(pipe + 3).trim();
    t = t.slice(0, pipe).trim();
    if (tail && !/^imdb$/i.test(tail)) {
      const list = tail
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);
      if (list.length) genres = list;
    }
  }
  t = t.replace(/\s+-\s+IMDb$/i, "").trim();
  t = t.replace(/\s*⭐.*$/u, "").trim();

  let year: number | undefined;
  const paren = t.match(/^(.+?)\s*\(([^()]*?)(\d{4})[^()]*\)\s*$/);
  if (paren) {
    t = paren[1].trim();
    year = Number.parseInt(paren[3], 10);
  }

  if (!t) return undefined;
  return { title: t, ...(year !== undefined ? { year } : {}), ...(genres ? { genres } : {}) };
}

/** Trim Amazon-style titles: "Product : Amazon.com: …" → "Product". */
export function normalizeAmazonTitle(title: string): string {
  let t = title.trim();
  const amazonSuffix = t.search(/:\s*Amazon\.[a-z.]+/i);
  if (amazonSuffix > 8) t = t.slice(0, amazonSuffix).trim();
  const colonNoise = t.match(/^(.{8,}?)\s*:\s*[^:]{3,80}$/);
  if (colonNoise) t = colonNoise[1].trim();
  return t || title.trim();
}

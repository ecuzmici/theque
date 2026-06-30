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

export function isWeakTitle(title: string | null | undefined, siteName?: string): boolean {
  if (!title?.trim()) return true;
  const t = title.trim();
  if (isErrorPageTitle(t)) return true;
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

/** Trim Amazon-style titles: "Product : Amazon.com: …" → "Product". */
export function normalizeAmazonTitle(title: string): string {
  let t = title.trim();
  const amazonSuffix = t.search(/:\s*Amazon\.[a-z.]+/i);
  if (amazonSuffix > 8) t = t.slice(0, amazonSuffix).trim();
  const colonNoise = t.match(/^(.{8,}?)\s*:\s*[^:]{3,80}$/);
  if (colonNoise) t = colonNoise[1].trim();
  return t || title.trim();
}

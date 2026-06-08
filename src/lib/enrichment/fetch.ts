import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const MAX_FETCH_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export type FetchPageResult = {
  html: string;
  finalUrl: string;
  statusCode: number;
};

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80")) return true; // link-local
  if (normalized.startsWith("0100::")) return true; // discard prefix

  // ::ffff:0:/96 — IPv4-translated (SIIT)
  if (normalized.startsWith("::ffff:0:")) return true;

  // IPv4-mapped ::ffff:x/96.
  // WHATWG URL normalizes dotted-decimal to hex: ::ffff:172.16.0.1 → ::ffff:ac10:1
  // dns.lookup may return dotted form: ::ffff:10.0.0.1
  if (normalized.startsWith("::ffff:")) {
    const suffix = normalized.slice(7); // "ac10:1" or "10.0.0.1"
    if (suffix.includes(".")) {
      // Dotted-decimal form from DNS lookup
      return isBlockedIpv4(suffix);
    }
    // Hex form from WHATWG URL: two colon-separated 16-bit groups
    const hexGroups = suffix.split(":");
    if (hexGroups.length === 2) {
      const high = Number.parseInt(hexGroups[0], 16);
      const low = Number.parseInt(hexGroups[1], 16);
      if (!Number.isNaN(high) && !Number.isNaN(low)) {
        const mapped = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
        return isBlockedIpv4(mapped);
      }
    }
  }

  return false;
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

export async function assertSafeFetchUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("blocked_fetch_url");
  }

  // Reject URLs with embedded credentials — they bypass auth checks and are never needed.
  if (url.username || url.password) {
    throw new Error("blocked_fetch_url");
  }

  // WHATWG URL wraps IPv6 literals in brackets (e.g. "[::1]"); strip them before isIP/isBlockedIpv6.
  const rawHostname = url.hostname.toLowerCase();
  const hostname =
    rawHostname.startsWith("[") && rawHostname.endsWith("]")
      ? rawHostname.slice(1, -1)
      : rawHostname;

  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("blocked_fetch_url");
  }

  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new Error("blocked_fetch_url");
    return;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error("blocked_fetch_url");
  }
  // NOTE: DNS rebinding (TOCTOU) — assertSafeFetchUrl resolves the hostname here,
  // but the subsequent fetch() call resolves DNS again independently. A complete fix
  // requires pinning the resolved IP by using an undici Agent with a custom connect
  // callback that re-validates at TCP-connect time. That approach is deferred for
  // Opus-level review (B4 follow-up) as it requires undici internals.
}

async function readTextLimited(res: Response): Promise<string> {
  const contentLength = res.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_FETCH_BYTES) {
    throw new Error("fetch_body_too_large");
  }

  if (!res.body) return "";

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_FETCH_BYTES) {
      throw new Error("fetch_body_too_large");
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }

  chunks.push(decoder.decode());
  return chunks.join("");
}

export async function fetchPage(url: string): Promise<FetchPageResult> {
  let current = new URL(url);
  let res: Response | null = null;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertSafeFetchUrl(current);
    res = await fetch(current, {
      signal: AbortSignal.timeout(8000),
      redirect: "manual",
      headers: {
        "User-Agent": DEFAULT_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    if (res.status < 300 || res.status >= 400) break;

    const location = res.headers.get("location");
    if (!location || redirectCount === MAX_REDIRECTS) {
      throw new Error("blocked_fetch_url");
    }
    current = new URL(location, current);
  }

  if (!res) throw new Error("blocked_fetch_url");

  const html = await readTextLimited(res);
  return {
    html,
    finalUrl: current.href,
    statusCode: res.status,
  };
}

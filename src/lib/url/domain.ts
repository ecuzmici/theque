export function domainFromCanonicalUrl(canonicalUrl: string): string {
  try {
    const u = new URL(canonicalUrl);
    return u.hostname.toLowerCase();
  } catch {
    return "";
  }
}

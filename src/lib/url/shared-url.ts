const HTTP_URL = /https?:\/\/[^\s<>"']+/i;

/**
 * Finds the shared link in PWA share-target parameters. Android often puts
 * the link inside `text` with other words ("Title https://…"), and some apps
 * send an empty `url=`. The function returns the first http(s) URL in `url`,
 * then `text`, then `title`. An empty value counts as missing.
 */
export function extractSharedUrl(params: {
  url?: string | null;
  text?: string | null;
  title?: string | null;
}): string | null {
  for (const value of [params.url, params.text, params.title]) {
    const match = value?.trim() ? value.match(HTTP_URL) : null;
    if (match) return match[0].replace(/[),.;!?]+$/, "");
  }
  return null;
}

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type FetchPageResult = {
  html: string;
  finalUrl: string;
  statusCode: number;
};

export async function fetchPage(url: string): Promise<FetchPageResult> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    redirect: "follow",
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

  const html = await res.text();
  return {
    html,
    finalUrl: res.url,
    statusCode: res.status,
  };
}

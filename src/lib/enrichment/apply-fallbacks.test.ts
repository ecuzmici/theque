import { afterEach, describe, expect, it, vi } from "vitest";

import { applyEnrichmentFallbacks } from "@/lib/enrichment/apply-fallbacks";
import { extractFromHtml } from "@/lib/enrichment/extract";

describe("applyEnrichmentFallbacks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fills IMDb title from suggestion API when HTML is blocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("media-imdb.com/suggestion")) {
          return new Response(
            JSON.stringify({
              d: [
                {
                  id: "tt1375666",
                  l: "Inception",
                  y: 2010,
                  s: "Christopher Nolan, Joseph Gordon-Levitt",
                  qid: "movie",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("<html></html>", { status: 404 });
      }),
    );

    const finalUrl = "https://www.imdb.com/title/tt1375666/";
    const html = `<!DOCTYPE html><html><head><title></title><script>window.awsWafCookieDomainList=[]</script></head><body></body></html>`;
    const fetchResult = { html, finalUrl, statusCode: 202 };
    const extracted = extractFromHtml(html, { finalUrl, statusCode: 202 });
    const result = await applyEnrichmentFallbacks(fetchResult, extracted, {
      requestUrl: finalUrl,
    });

    expect(result.title).toBe("Inception");
    expect(result.structured.year).toBe(2010);
    expect(result.structured.directors).toEqual(["Christopher Nolan"]);
  });

  it("uses Google Maps place name from request URL when redirect strips path", async () => {
    const requestUrl =
      "https://www.google.com/maps/place/Caf%C3%A9+de+Flore/@48.8541604,2.3325599,17z";
    const finalUrl = "https://www.google.com/maps";
    const html = `<!DOCTYPE html><html><head>
      <title>Google Maps</title>
      <meta property="og:title" content="Google Maps" />
      <meta property="og:site_name" content="Google" />
    </head><body></body></html>`;
    const fetchResult = { html, finalUrl, statusCode: 200 };
    const extracted = extractFromHtml(html, { finalUrl, statusCode: 200 });
    const result = await applyEnrichmentFallbacks(fetchResult, extracted, { requestUrl });

    expect(result.title).toBe("Café de Flore");
    expect(result.structured.place_name).toBe("Café de Flore");
  });

  it("calls IMDb suggestion API when HTML parses but lacks year", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("media-imdb.com/suggestion")) {
          return new Response(
            JSON.stringify({
              d: [{ id: "tt1375666", l: "Inception", y: 2010, s: "Christopher Nolan", qid: "movie" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("<html></html>", { status: 200 });
      }),
    );

    const finalUrl = "https://www.imdb.com/title/tt1375666/";
    const html = `<!DOCTYPE html><html><head>
      <title>IMDb</title>
      <meta property="og:title" content="IMDb" />
      <meta property="og:site_name" content="IMDb" />
    </head><body></body></html>`;
    const fetchResult = { html, finalUrl, statusCode: 200 };
    const extracted = extractFromHtml(html, { finalUrl, statusCode: 200 });
    const result = await applyEnrichmentFallbacks(fetchResult, extracted, { requestUrl: finalUrl });

    expect(result.title).toBe("Inception");
    expect(result.structured.year).toBe(2010);
  });
});
